/* engine.js — board renderer, stepper and page renderer.
   Consumes document, navigation, path, layout, state and geometry helpers
   from the validator bundle. Render functions need a DOM and are
   only called from the boot files. */

var SVGNS = 'http://www.w3.org/2000/svg';
var RM = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

function diagramHasDelta(d){
  d = d || {};
  return Object.keys(d.nodes || {}).some(function(id){
    return d.nodes[id] && d.nodes[id].delta === true;
  }) || (d.edges || []).some(function(e){ return e && e.delta === true; }) ||
    (d.steps || []).some(function(st){ return st && st.delta === true; });
}

/* ---------------- host-driven skin interface ---------------- */
function resolveSkin(cookieText, specSkin){
  var cookieSkin = null;
  if (typeof cookieText === 'string'){
    cookieText.split(';').some(function(part){
      var eq = part.indexOf('=');
      if (eq < 0 || part.slice(0, eq).trim() !== 'dv_skin') return false;
      var candidate = part.slice(eq + 1).trim();
      try { candidate = decodeURIComponent(candidate); }
      catch (ex) { /* malformed escapes stay raw and fail normal token validation */ }
      if (SKIN_NAMES.indexOf(candidate) < 0) return false;
      cookieSkin = candidate;
      return true;
    });
  }
  if (cookieSkin) return cookieSkin;
  return SKIN_NAMES.indexOf(specSkin) >= 0 ? specSkin : DEFAULT_SKIN;
}

function skinBase(name){
  return name === 'daylight' ? 'daylight' : 'aurora';
}

function skinClasses(name){
  var base = skinBase(name);
  return base === name ? ['sk-' + base] : ['sk-' + base, 'sk-' + name];
}

function applySkinClasses(body, view, name){
  if (SKIN_NAMES.indexOf(name) < 0) return false;
  [body, view].forEach(function(el){
    if (!el || !el.classList) return;
    SKIN_NAMES.forEach(function(n){ el.classList.remove('sk-' + n); });
    skinClasses(name).forEach(function(cls){ el.classList.add(cls); });
  });
  if (view && view.querySelector){
    var label = view.querySelector('[data-dv-skin-label]');
    if (label) label.textContent = 'generated from spec · skin: ' + name;
  }
  return true;
}

function protocolColorStyle(protos, kind){
  return '--dv-aurora:' + kindColor(protos, kind, 'aurora') +
         ';--dv-daylight:' + kindColor(protos, kind, 'daylight');
}

/* ---------------- derived cross-page backlinks ---------------- */
function safeBacklinkHref(href){
  return typeof href === 'string' &&
    /^(?:[A-Za-z0-9._-]+\.html|\.\.\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.html)$/.test(href);
}

function parseBacklinks(raw){
  if (typeof raw === 'string'){
    try { raw = JSON.parse(raw); }
    catch (ex) { return Object.create(null); }
  }
  var services = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.services : null;
  var out = Object.create(null);
  if (!services || typeof services !== 'object' || Array.isArray(services)) return out;
  Object.keys(services).forEach(function(title){
    var records = services[title];
    if (!Array.isArray(records)) return;
    var seen = Object.create(null), clean = [];
    records.forEach(function(record){
      if (!record || typeof record !== 'object' || Array.isArray(record) ||
          typeof record.title !== 'string' || !safeBacklinkHref(record.href) ||
          seen[record.href]) return;
      seen[record.href] = true;
      clean.push({href:record.href, title:record.title});
    });
    if (clean.length) out[title] = clean;
  });
  return out;
}

function wireNodeBacklinks(host, svg, diagram, prefix, backlinks){
  if (!host || !svg || !backlinks) return null;
  var triggers = svg.querySelectorAll('.nbackref');
  if (!triggers.length) return null;
  var pop = document.createElement('div');
  pop.className = 'nbackpop';
  pop.id = prefix + '-backlinks';
  pop.setAttribute('role', 'dialog');
  pop.hidden = true;
  host.appendChild(pop);
  var active = null, pinned = false, closeTimer = null, suppressFocusOpen = null;
  var listeners = [], destroyed = false;

  function listen(target, type, fn){
    target.addEventListener(type, fn);
    listeners.push({target:target, type:type, fn:fn});
  }
  function cancelClose(){
    if (closeTimer !== null){ clearTimeout(closeTimer); closeTimer = null; }
  }
  function setExpanded(trigger, expanded){
    if (trigger) trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  function containsTarget(target){
    if (!target) return false;
    return !!((active && active.contains && active.contains(target)) ||
              (pop.contains && pop.contains(target)));
  }
  function close(returnFocus){
    cancelClose();
    var trigger = active;
    setExpanded(active, false);
    active = null;
    pinned = false;
    pop.hidden = true;
    if (returnFocus && trigger && trigger.focus){
      /* A focus listener normally opens the popover.  Escape should instead
         return focus to its trigger while leaving the popover closed. */
      suppressFocusOpen = trigger;
      trigger.focus();
      suppressFocusOpen = null;
    }
  }
  function scheduleClose(){
    if (destroyed) return;
    cancelClose();
    if (!pinned && !containsTarget(document.activeElement)){
      closeTimer = setTimeout(close, 140);
    }
  }
  function closeOnFocusOutside(ev){
    if (containsTarget(ev.relatedTarget)) cancelClose();
    else close();
  }
  function position(trigger){
    var tr = trigger.getBoundingClientRect();
    var width = pop.offsetWidth || 260;
    var height = pop.offsetHeight || 40;
    var viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    var viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    var maxLeft = Math.max(8, viewportWidth - width - 8);
    var left = tr.left + tr.width / 2 - width / 2;
    var top = tr.bottom + 6;
    if (top + height > viewportHeight - 8) top = Math.max(8, tr.top - height - 6);
    pop.style.left = Math.max(8, Math.min(maxLeft, left)) + 'px';
    pop.style.top = top + 'px';
  }
  function show(trigger, pin){
    if (destroyed) return;
    cancelClose();
    if (active !== trigger){
      setExpanded(active, false);
      active = trigger;
      var id = trigger.getAttribute('data-dv-node-id');
      var node = (diagram.nodes || {})[id] || {};
      var title = node.title;
      var records = typeof title === 'string' &&
        Object.prototype.hasOwnProperty.call(backlinks, title) ? backlinks[title] : [];
      pop.innerHTML = '';
      var label = document.createElement('span');
      label.className = 'nbacklabel';
      label.textContent = 'also in:';
      pop.appendChild(label);
      records.forEach(function(record){
        var link = document.createElement('a');
        link.className = 'nbacklink';
        link.href = record.href;
        link.textContent = record.title + ' \u2197';
        pop.appendChild(link);
      });
      pop.setAttribute('aria-label', 'Other pages containing ' + (title || 'this service'));
    }
    if (pin) pinned = true;
    pop.hidden = false;
    setExpanded(trigger, true);
    position(trigger);
  }

  for (var i = 0; i < triggers.length; i++){
    (function(trigger){
      trigger.setAttribute('aria-controls', pop.id);
      listen(trigger, 'mouseenter', function(){ show(trigger, false); });
      listen(trigger, 'mouseleave', scheduleClose);
      listen(trigger, 'focus', function(){
        if (suppressFocusOpen === trigger) return;
        show(trigger, false);
      });
      listen(trigger, 'focusout', closeOnFocusOutside);
      listen(trigger, 'click', function(ev){
        ev.stopPropagation();
        if (active === trigger && pinned) close();
        else show(trigger, true);
      });
      listen(trigger, 'keydown', function(ev){
        if (ev.key === 'Enter' || ev.key === ' '){
          ev.preventDefault();
          if (active === trigger && pinned) close();
          else show(trigger, true);
        } else if (ev.key === 'Escape'){
          ev.preventDefault();
          close(true);
        }
      });
    })(triggers[i]);
  }
  listen(pop, 'mouseenter', cancelClose);
  listen(pop, 'mouseleave', scheduleClose);
  listen(pop, 'focusin', cancelClose);
  listen(pop, 'focusout', closeOnFocusOutside);
  listen(pop, 'keydown', function(ev){
    if (ev.key === 'Escape'){
      ev.preventDefault();
      close(true);
    }
  });
  listen(document, 'click', function(ev){
    if (!pop.hidden && !containsTarget(ev.target)) close();
  });
  var scrollHost = host.parentNode;
  if (scrollHost && scrollHost.addEventListener) listen(scrollHost, 'scroll', close);
  return {destroy:function(){
    if (destroyed) return;
    destroyed = true;
    close(false);
    listeners.forEach(function(listener){ listener.target.removeEventListener(listener.type, listener.fn); });
    listeners = [];
    for (var i = 0; i < triggers.length; i++){
      setExpanded(triggers[i], false);
      if (triggers[i].getAttribute('aria-controls') === pop.id) triggers[i].removeAttribute('aria-controls');
    }
    pop.remove();
  }};
}

/* Node references are authored evidence. Related step code is labeled as such,
   never presented as proof that an endpoint owns the referenced implementation. */
function nodeReferenceLinks(diagram,id){
  if(typeof FlowCanon==='undefined')return [];
  var node=(diagram.nodes || {})[id];if(!node)return [];
  var out=[],seen=Object.create(null),binding=node.binding || {};
  function label(value,fallback){return typeof value==='string' && value ? value : fallback;}
  function add(group,name,url){url=FlowCanon.http(url);if(!url || seen[url])return;seen[url]=true;out.push({group:group,label:name,url:url});}
  function code(refs,group,suffix){
    (Array.isArray(refs)?refs:[]).forEach(function(ref){
      if(!ref || typeof ref!=='object' || Array.isArray(ref))return;
      add(group,'Code · '+label(ref.label,label(ref.id,'source'))+(suffix?' · '+suffix:''),FlowCanon.codeUrl(ref));
    });
  }
  add('Node links','Source',node.link);
  add('Node links','Backstage · '+label(binding.label,label(binding.entityRef,id)),binding.catalogUrl);
  var api=binding.api || {};
  add('Node links','API definition · '+label(api.operationId,label(api.title,label(api.entityRef,'API'))),api.definitionUrl);
  Object.keys(api.endpoints || {}).forEach(function(env){add('Node links','Endpoint · '+env,api.endpoints[env]);});
  code(node.codeRefs,'Node links');
  (Array.isArray(diagram.steps)?diagram.steps:[]).forEach(function(step,index){
    if(!step || !Array.isArray(step.codeRefs))return;
    var keys=stepKeys(step).concat(Object.keys(stepFailures(step)));
    var involved=(Array.isArray(step.nodes) && step.nodes.indexOf(id)>=0) ||
      (step.traceMatch && step.traceMatch.nodeId===id) ||
      (step.tone && Object.prototype.hasOwnProperty.call(step.tone,id)) ||
      (Array.isArray(step.conditions) && step.conditions.some(function(c){return c && c.nodeId===id;})) ||
      (diagram.edges || []).some(function(e){return (e.from===id || e.to===id) && keys.indexOf(e.from+'->'+e.to)>=0;});
    if(involved)code(step.codeRefs,'Related step code',label(step.title,label(step.id,'Step '+(index+1))));
  });
  return out;
}
function wireNodeReferences(host,svg,diagram,prefix){
  if(!svg || typeof svg.querySelectorAll!=='function')return null;
  var triggers=svg.querySelectorAll('.nrefs-trigger');if(!triggers.length)return null;
  var pop=document.createElement('div');pop.className='nbackpop node-link-menu';pop.id=prefix+'-node-links';
  /* contextmenu can fire before pointerup. Auto popovers treat that release
     outside the new menu as light-dismiss; our listeners own dismissal. */
  pop.setAttribute('role','dialog');pop.setAttribute('popover','manual');pop.hidden=true;host.appendChild(pop);
  var active=null,open=false,destroyed=false,scrollAtOpen=[];
  function inside(target){return pop.contains(target) || !!(active && active.contains(target));}
  function close(focus){
    if(!open)return;open=false;scrollAtOpen=[];
    var trigger=active;active=null;if(trigger)trigger.setAttribute('aria-expanded','false');
    document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',focusOutside,true);
    document.removeEventListener('keydown',escape,true);document.removeEventListener('scroll',scroll,true);
    window.removeEventListener('resize',resize);
    if(pop.hidePopover && pop.matches(':popover-open'))pop.hidePopover();pop.hidden=true;
    if(focus && trigger && trigger.isConnected)trigger.focus();
  }
  function outside(ev){if(!inside(ev.target))close(false);}
  function focusOutside(ev){if(!inside(ev.target))close(false);}
  function escape(ev){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();close(true);}}
  function scroll(ev){
    var target=ev.target===document || (ev.target && ev.target.nodeType===9)?(document.scrollingElement || document.documentElement):ev.target;
    /* Scrolling a narrow board to reach the trigger can queue an event that
       arrives after opening. Dismiss only for movement since the menu opened. */
    if(scrollAtOpen.some(function(s){return s.el===target && (s.x!==target.scrollLeft || s.y!==target.scrollTop);}))close(false);
  }
  function resize(){close(false);}
  function show(trigger,point){
    if(destroyed)return;
    var id=trigger.getAttribute('data-dv-node-id'),node=(diagram.nodes || {})[id] || {},links=nodeReferenceLinks(diagram,id);
    if(!links.length)return;close(false);active=trigger;open=true;pop.replaceChildren();
    var title=document.createElement('strong');title.className='node-link-title';title.textContent=node.title || id;pop.appendChild(title);
    pop.setAttribute('aria-label','Links for '+(node.title || id));
    var dismiss=document.createElement('button');dismiss.type='button';dismiss.className='node-link-close';dismiss.textContent='×';dismiss.setAttribute('aria-label','Close node links');dismiss.addEventListener('click',function(){close(true);});pop.appendChild(dismiss);
    var group;
    links.forEach(function(item){
      if(group!==item.group){var heading=document.createElement('span');heading.className='nbacklabel';heading.textContent=item.group;pop.appendChild(heading);group=item.group;}
      var a=document.createElement('a');a.className='nbacklink node-reference-link';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.label+' ↗';pop.appendChild(a);
    });
    trigger.setAttribute('aria-expanded','true');pop.hidden=false;if(pop.showPopover)pop.showPopover();
    var rect=trigger.getBoundingClientRect(),vw=window.innerWidth || document.documentElement.clientWidth,vh=window.innerHeight || document.documentElement.clientHeight;
    var left=point?point.x:rect.left,top=point?point.y:rect.bottom+6;
    pop.style.left=Math.max(8,Math.min(vw-pop.offsetWidth-8,left))+'px';pop.style.top=Math.max(8,Math.min(vh-pop.offsetHeight-8,top))+'px';
    pop.querySelector('a').focus({preventScroll:true});
    /* Native mounts include scroll containers beyond their shadow boundary. */
    for(var ancestor=trigger;ancestor;ancestor=ancestor.parentElement || (ancestor.getRootNode && ancestor.getRootNode().host))
      scrollAtOpen.push({el:ancestor,x:ancestor.scrollLeft,y:ancestor.scrollTop});
    document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',focusOutside,true);
    document.addEventListener('keydown',escape,true);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',resize);
  }
  function triggerFrom(ev){var node=ev.target.closest && ev.target.closest('.node[data-dv-node]');return node && node.querySelector('.nrefs-trigger');}
  svg.addEventListener('contextmenu',function(ev){
    var trigger=triggerFrom(ev);if(!trigger)return;
    ev.preventDefault();ev.stopPropagation();show(trigger,ev.clientX||ev.clientY?{x:ev.clientX,y:ev.clientY}:null);
  });
  triggers.forEach(function(trigger){
    trigger.setAttribute('aria-controls',pop.id);
    trigger.addEventListener('mousedown',function(ev){ev.stopPropagation();});
    trigger.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();if(open && active===trigger)close(false);else show(trigger);});
    trigger.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'||ev.key===' '||ev.key==='ContextMenu'||(ev.shiftKey&&ev.key==='F10')){ev.preventDefault();ev.stopPropagation();show(trigger);}
    });
  });
  pop.addEventListener('click',function(ev){ev.stopPropagation();});
  pop.addEventListener('keydown',function(ev){
    ev.stopPropagation();var links=Array.prototype.slice.call(pop.querySelectorAll('a')),index=links.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].indexOf(ev.key)<0)return;ev.preventDefault();
    var next=ev.key==='Home'?0:ev.key==='End'?links.length-1:ev.key==='ArrowDown'?(index+1)%links.length:(index-1+links.length)%links.length;
    links[next].focus();
  });
  pop.addEventListener('toggle',function(ev){if(ev.newState==='closed')close(false);});
  return {destroy:function(){close(false);destroyed=true;pop.remove();}};
}

/* Fragment reveal state is deliberately a pure function of the target step.
   Invalid indices are ignored (the validator warns), and ambient mode always
   shows the complete section. */
function validRevealIndex(v){
  return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0;
}
function fragmentVisible(fragment, stepIdx, stepMode){
  if (!stepMode) return true;
  fragment = fragment || {};
  if (validRevealIndex(fragment.revealAt) && stepIdx < fragment.revealAt) return false;
  if (validRevealIndex(fragment.hideAt) && stepIdx >= fragment.hideAt) return false;
  return true;
}
function fragmentAttrs(fragment){
  fragment = fragment || {};
  var attrs = '';
  if (validRevealIndex(fragment.revealAt) || validRevealIndex(fragment.hideAt)){
    attrs += ' data-dv-fragment=""';
    if (validRevealIndex(fragment.revealAt)) attrs += ' data-dv-reveal-at="' + fragment.revealAt + '"';
    if (validRevealIndex(fragment.hideAt)) attrs += ' data-dv-hide-at="' + fragment.hideAt + '"';
  }
  return attrs;
}
function markFragmentElement(el, fragment){
  if (!el || (!validRevealIndex(fragment && fragment.revealAt) &&
              !validRevealIndex(fragment && fragment.hideAt))) return;
  el.setAttribute('data-dv-fragment', '');
  if (validRevealIndex(fragment.revealAt)) el.setAttribute('data-dv-reveal-at', fragment.revealAt);
  if (validRevealIndex(fragment.hideAt)) el.setAttribute('data-dv-hide-at', fragment.hideAt);
}
function setFragmentStep(scope, stepIdx, stepMode){
  if (!scope || !scope.querySelectorAll) return;
  var els = scope.querySelectorAll('[data-dv-fragment]');
  for (var i = 0; i < els.length; i++){
    var el = els[i];
    var r = el.getAttribute('data-dv-reveal-at');
    var h = el.getAttribute('data-dv-hide-at');
    var meta = {revealAt:r == null ? null : Number(r), hideAt:h == null ? null : Number(h)};
    var shown = fragmentVisible(meta, stepIdx, stepMode);
    if (shown){
      el.classList.remove('dv-fragment-hidden');
      el.removeAttribute('aria-hidden');
    } else {
      el.classList.add('dv-fragment-hidden');
      el.setAttribute('aria-hidden', 'true');
    }
  }
}

/* A story tween is presentation-only and exists between any two
   already-painted step states, whatever their distance — arrows, step
   chips, and step picks all animate alike. Callers explicitly suppress
   the narrative path for deep links/restores, mode entry, and the
   autoplay wrap back to step 0; reduced motion is a hard gate. */
function shouldTweenStep(fromIndex, toIndex, reducedMotion, narrativePath){
  return narrativePath !== false && !reducedMotion &&
    validRevealIndex(fromIndex) && validRevealIndex(toIndex) &&
    toIndex !== fromIndex;
}

/* Node-tone state is absolute (foldNodeTones), while its pulse is transient
   presentation metadata. Only an adjacent forward narrative move may pulse;
   backward moves, jumps, first paint, and reduced motion are settled. */
function nodeTonesAt(states, stepIndex, stepMode){
  if (!stepMode || !Array.isArray(states) || !validRevealIndex(stepIndex)) return {};
  var state = states[stepIndex];
  return state && typeof state === 'object' ? state : {};
}

function tonePulseNodes(states, fromIndex, toIndex, reducedMotion, narrativePath){
  if (reducedMotion || narrativePath === false ||
      !validRevealIndex(fromIndex) || !validRevealIndex(toIndex) ||
      toIndex !== fromIndex + 1) return [];
  var before = nodeTonesAt(states, fromIndex, true);
  var after = nodeTonesAt(states, toIndex, true);
  var ids = {};
  Object.keys(before).forEach(function(id){ ids[id] = true; });
  Object.keys(after).forEach(function(id){ ids[id] = true; });
  return Object.keys(ids).filter(function(id){ return before[id] !== after[id]; });
}

function applyNodeTones(nodeEls, tones, pulseIds){
  nodeEls = nodeEls || {};
  tones = tones || {};
  var pulse = {};
  (pulseIds || []).forEach(function(id){ pulse[id] = true; });
  Object.keys(nodeEls).forEach(function(id){
    var node = nodeEls[id];
    if (!node || !node.classList) return;
    var tone = tones[id];
    var wanted = (TONE_SET.indexOf(tone) >= 0 && tone !== 'base') ? 'tone-' + tone : null;
    TONE_SET.forEach(function(tone){
      var name = 'tone-' + tone;
      if (tone !== 'base' && name !== wanted && node.classList.contains(name)){
        node.classList.remove(name);
      }
    });
    if (wanted && !node.classList.contains(wanted)) node.classList.add(wanted);
    if (node.classList.contains('tone-pulse')) node.classList.remove('tone-pulse');
  });
  Object.keys(pulse).forEach(function(id){
    var node = nodeEls[id];
    if (!node || !node.classList) return;
    /* Flush the class removal so consecutive changed beats on the same node
       restart the one-shot instead of inheriting a still-running animation. */
    if (node.getBoundingClientRect){ try { node.getBoundingClientRect(); } catch (ex) {} }
    node.classList.add('tone-pulse');
  });
}

/* Step focus and semantic tone deliberately travel through separate paths.
   Failed communications focus their source; delivered hops focus both ends. */
function applyStepNodeFocus(nodeEls, step, edgeIds){
  nodeEls = nodeEls || {};
  step = step || {};
  edgeIds = edgeIds || {};
  var focused = {};
  (step.keys || []).forEach(function(key){
    var info = edgeIds[key];
    if (!info || !info.e) return;
    focused[info.e.from] = true;
    focused[info.e.to] = true;
  });
  Object.keys(step.failures || {}).forEach(function(key){
    var info = edgeIds[key];
    if (info && info.e) focused[info.e.from] = true;
  });
  (step.nodes || []).forEach(function(id){ focused[id] = true; });
  Object.keys(focused).forEach(function(id){
    var node = nodeEls[id];
    if (node && node.classList && !node.classList.contains('lit')) node.classList.add('lit');
  });
}

/* Failed communications are local to one beat, never carried like state. */
function communicationFailureText(diagram,failures){
  return Object.keys(failures || {}).map(function(key){
    var edge = (diagram.edges || []).find(function(e){return e.from + '->' + e.to === key;});
    if (!edge) return '';
    var nodes = diagram.nodes || {};
    return (failures[key] === 'blocked' ? 'Not sent: ' : 'Dropped: ') +
      ((nodes[edge.from] || {}).title || edge.from) + ' → ' + ((nodes[edge.to] || {}).title || edge.to);
  }).filter(Boolean).join(' · ');
}
function communicationBreak(length,mode){
  var stop = mode === 'blocked' ? Math.min(24,length * .25) : length * .55;
  var gap = Math.min(10,stop * .65,(length - stop) * .65);
  return {stop:stop, before:stop - gap, after:stop + gap};
}
function communicationSegment(path,from,to){
  var parts = [], count = Math.max(1,Math.ceil((to - from) / 6));
  for (var i = 0; i <= count; i++){
    var p = path.getPointAtLength(from + (to - from) * i / count);
    parts.push((i ? 'L' : 'M') + p.x.toFixed(2) + ' ' + p.y.toFixed(2));
  }
  return parts.join(' ');
}
function clearCommunicationFailures(board){
  (board.failureEffects || []).forEach(function(effect){
    effect.hidden.forEach(function(el){el.classList.remove('comm-hidden');});
    if (effect.label) effect.label.classList.remove('comm-label');
    if (effect.group.parentNode) effect.group.parentNode.removeChild(effect.group);
  });
  board.failureEffects = [];
}
function settleCommunicationFailures(board){
  (board.failureEffects || []).forEach(function(effect){
    if (effect.packet && effect.packet.parentNode) effect.packet.parentNode.removeChild(effect.packet);
  });
}
function showCommunicationFailures(board,failures,animate){
  Object.keys(failures || {}).forEach(function(key){
    var info = board.edgeIds[key], path = info && info.pathEl;
    if (!path || path.classList.contains('dv-fragment-hidden')) return;
    var length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return;
    var mode = failures[key], split = communicationBreak(length,mode), point = path.getPointAtLength(split.stop);
    function svgEl(tag,attrs,parent){
      var el = document.createElementNS(SVGNS,tag);
      Object.keys(attrs).forEach(function(k){el.setAttribute(k,attrs[k]);});
      if (parent) parent.appendChild(el);
      return el;
    }
    var label = (mode === 'blocked' ? 'Not sent: ' : 'Dropped in transit: ') + info.e.from + ' → ' + info.e.to;
    var group = svgEl('g',{'class':'comm-failure comm-' + mode,'data-dv-edge':info.idx,'role':'img','aria-label':label},board.svg);
    svgEl('title',{},group).textContent = label;
    svgEl('path',{'class':'comm-segment comm-before',d:communicationSegment(path,0,split.before)},group);
    svgEl('path',{'class':'comm-segment comm-after',d:communicationSegment(path,split.after,length)},group);
    var marker = svgEl('g',{'class':'comm-break',transform:'translate(' + point.x + ' ' + point.y + ')'},group);
    if (mode === 'blocked'){
      svgEl('circle',{r:8},marker);
      svgEl('path',{d:'M-5 0H5'},marker);
    } else svgEl('path',{d:'M-6 -6L6 6M-6 6L6 -6'},marker);
    var hidden = [path,info.haloEl,info.coinEl].filter(Boolean);
    hidden.forEach(function(el){el.classList.add('comm-hidden');});
    if (info.labelEl) info.labelEl.classList.add('comm-label');
    var effect = {group:group,hidden:hidden,label:info.labelEl,packet:null};
    (board.failureEffects || (board.failureEffects = [])).push(effect);
    if (mode !== 'dropped' || !animate) return;
    var packet = svgEl('circle',{'class':'pkt comm-packet',r:4.5},group);
    var motion = svgEl('animateMotion',{dur:'1.35s',begin:'indefinite',fill:'freeze',calcMode:'linear',
      keyPoints:'0;' + (split.stop / length) + ';' + (split.stop / length),keyTimes:'0;0.7;1'},packet);
    svgEl('mpath',{href:'#' + info.domId},motion);
    var fade = svgEl('animate',{attributeName:'opacity',values:'1;1;0',keyTimes:'0;0.8;1',dur:'1.35s',begin:'indefinite',fill:'freeze'},packet);
    effect.packet = packet;
    try { motion.beginElement(); fade.beginElement(); } catch (ex){
      /* The static break remains useful when SMIL is unavailable. */
      group.removeChild(packet); effect.packet = null;
    }
  });
}

/* Both link menus belong to this board, including listeners outside its DOM. */
function destroyBoardLinks(el){
  ['_nodeBacklinks', '_nodeLinks'].forEach(function(key){
    var controller = el[key];
    el[key] = null;
    if (controller) controller.destroy();
  });
}
function renderBoard(el, d, prefix, skin, protos, backlinks, options){
  destroyBoardLinks(el);
  var SK = SKINS[skinBase(skin)];
  var L = layout(d);
  var ADJ = L.routing === 'lanes' ? laneRoutes(d,L) : edgeAutoAdjust(d.edges || [], L);
  if (L.routing !== 'lanes') resolveEdgeAvoidance(d.edges || [], L, ADJ);
  var kindsUsed = {}, anyRet = false;
  (d.edges || []).forEach(function(e){
    kindsUsed[protos[e.kind] ? e.kind : 'int'] = true;
    if (e.ret) anyRet = true;
  });

  var vb = L.vb || {x:0, y:0, w:W, h:L.H};
  var diagramRole=Object.values(d.nodes || {}).some(function(n){return n && n.handoff;})?'group':'img';
  var s = '<svg viewBox="' + vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h + '" role="' + diagramRole + '" aria-label="' + esc(d.title || 'flow diagram') + '" xmlns="' + SVGNS + '">';
  s += '<defs>';
  Object.keys(kindsUsed).forEach(function(k){
    s += '<marker id="' + prefix + '-m-' + k + '" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">' +
         '<path class="dv-protocol-fill" style="' + protocolColorStyle(protos, k) + '" d="M0 0L10 5L0 10z" fill="' + kindColor(protos, k, skinBase(skin)) + '"/></marker>';
  });
  s += '<pattern id="' + prefix + '-g" width="26" height="26" patternUnits="userSpaceOnUse">' +
       '<circle cx="1.3" cy="1.3" r="1.3" fill="#16233C"/></pattern>';
  var groundXY = (vb.x ? ' x="' + vb.x + '"' : '') + (vb.y ? ' y="' + vb.y + '"' : '');
  s += '</defs><rect class="dv-board-ground"' + groundXY + ' width="' + vb.w + '" height="' + vb.h + '" fill="' + SK.bg + '"/>' +
       '<rect class="dv-board-grid"' + groundXY + ' width="' + vb.w + '" height="' + vb.h + '" fill="url(#' + prefix + '-g)"/>';

  /* containment groups: dashed boundary + title, behind everything */
  var groupDefs = (d.groups && typeof d.groups === 'object') ? d.groups : {};
  Object.keys(L.groups).sort(function(a, b){ return L.groups[a].nestLevel - L.groups[b].nestLevel; }).forEach(function(g){
    var b = L.groups[g];
    var meta = groupDefs[g] || {};
    var groupIcon = typeof meta.icon === 'string' ? (ICON_SET.indexOf(meta.icon) >= 0 ? meta.icon : 'gear') : null;
    s += '<g class="grp" data-dv-group="' + esc(g) + '"><rect class="grpbox" x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="14"/>' +
         (groupIcon == null ? '' : '<use href="#i-' + esc(groupIcon) + '" class="grpicon" x="' + (b.x + 12) + '" y="' + (b.y + 5) + '" width="14" height="14" aria-hidden="true"/>') +
         '<text class="grptitle" x="' + (b.x + (groupIcon == null ? 14 : 32)) + '" y="' + (b.y + 16) + '">' + esc(meta.title || g) + '</text></g>';
  });

  var edgeIds = {};
  s += '<g>';
  (d.edges || []).forEach(function(e, i){
    var k = protos[e.kind] ? e.kind : 'int';
    s += '<path class="halo dv-protocol-stroke' + (e.delta === true ? ' dvd' : '') + '" data-dv-edge="' + i + '"' + fragmentAttrs(e) +
         ' style="' + protocolColorStyle(protos, k) + '" stroke="' +
         kindColor(protos, k, skinBase(skin)) + '" d="' + edgePath(e, L, ADJ[i]) + '"/>';
  });
  (d.edges || []).forEach(function(e, i){
    var id = prefix + '-e' + i;
    var k = protos[e.kind] ? e.kind : 'int';
    edgeIds[e.from + '->' + e.to] = {domId:id, e:e, kind:k, idx:i};
    if (L.routing === 'lanes') s += '<path class="lane-bridge" stroke="'+SK.bg+'" d="'+edgePath(e,L,ADJ[i])+'"/>';
    s += '<path id="' + id + '" class="edge dv-protocol-stroke ' + (e.ret ? 'retm' : 'main') + (e.delta === true ? ' dvd' : '') + '"' +
         ' data-dv-edge="' + i + '"' +
         fragmentAttrs(e) + ' style="' + protocolColorStyle(protos, k) +
         '" stroke="' + kindColor(protos, k, skinBase(skin)) +
         '" stroke-dasharray="' + (e.ret ? DASH_RET : DASH_MAIN) + '" d="' + edgePath(e, L, ADJ[i]) +
         '" marker-end="url(#' + prefix + '-m-' + k + ')"/>';
  });
  s += '</g>';

  Object.keys(d.nodes).forEach(function(id){
    var n = d.nodes[id] || {}, p = L.pos[id];
    if (!p) return;
    var small = p.h === FLOAT_H;
    var icon = ICON_SET.indexOf(n.icon) >= 0 ? n.icon : 'gear';
    var tint = TINT_SET.indexOf(n.tint) >= 0 ? n.tint : 'cmd';
    var x = p.cx - p.w/2, y = p.cy - p.h/2;
    var nodeTitle = n.title || id;
    var shownTitle = L.routing === 'lanes' && Array.from(nodeTitle).length > 13 ? Array.from(nodeTitle).slice(0,12).join('')+'…' : nodeTitle;
    var siblingPages = typeof n.title === 'string' &&
      Object.prototype.hasOwnProperty.call(backlinks || {}, n.title) ? backlinks[n.title] : [];
    var nodeLink = n.link || (typeof FlowCanon!=='undefined' && n.binding && FlowCanon.http(n.binding.catalogUrl));
    var hasNodeLink = nodeLink && typeof nodeLink === 'string';
    var hasReferences=nodeReferenceLinks(d,id).length>0,referenceX=p.w-(hasNodeLink?38:15);
    var backlinkX = p.w - 15 - (hasNodeLink?23:0) - (hasReferences?23:0);
    s += '<g class="node tint-' + tint + (n.handoff ? ' node-handoff' : '') + (n.delta === true ? ' dvd' : '') + '" id="' + prefix + '-n-' + esc(id) + '" data-dv-node="' + esc(id) + '" transform="translate(' + x + ' ' + y + ')">' +
         (L.routing === 'lanes' ? '<title>'+esc(nodeTitle)+'</title>' : '') +
         (n.handoff ? handoffNodeContent(n,p,id,prefix,options) :
         '<rect class="card" width="' + p.w + '" height="' + p.h + '" rx="12"/>' +
         '<rect class="icbg" x="12" y="' + (small?9:14) + '" width="26" height="26" rx="8"/>' +
         '<use href="#i-' + icon + '" x="17" y="' + (small?14:19) + '" width="16" height="16"/>' +
         '<text class="t1" x="46" y="' + (small?22:25) + '">' + esc(shownTitle) + '</text>' +
         '<text class="t2" x="46" y="' + (small?36:41) + '">' + esc(n.sub || '') + '</text>') +
         (hasNodeLink ?
           '<a class="nlink" href="' + esc(nodeLink) + '" target="_blank" rel="noopener" aria-label="Source for ' + esc(nodeTitle) + '">' +
           '<circle cx="' + (p.w - 15) + '" cy="14" r="9" fill="transparent"/>' +
           '<text x="' + (p.w - 15) + '" y="18" text-anchor="middle">&#8599;</text></a>' : '') +
         (hasReferences ?
           '<g class="nlink nrefs-trigger" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" data-dv-node-id="' + esc(id) + '" aria-label="Links for ' + esc(nodeTitle) + '">' +
           '<title>Links · right-click this node or open here</title><circle cx="' + referenceX + '" cy="14" r="10" fill="transparent"/>' +
           '<text x="' + referenceX + '" y="18" text-anchor="middle">&#8943;</text></g>' : '') +
         (siblingPages.length ?
           '<g class="nbackref" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" data-dv-node-id="' + esc(id) + '" aria-label="Other pages containing ' + esc(nodeTitle) + '">' +
           '<circle cx="' + backlinkX + '" cy="14" r="9" fill="transparent"/>' +
           '<text x="' + backlinkX + '" y="18" text-anchor="middle">&#8599;</text></g>' : '') +
         (n.detail ? '<g class="detail-trigger" role="button" tabindex="0" data-dv-detail="' + esc(id) + '" aria-label="Explore ' + esc(nodeTitle) + '"><title>' + 'Explore ' + esc(nodeTitle) + '</title><rect x="' + (p.w-30) + '" y="' + (p.h-25) + '" width="26" height="22" rx="6"/><text x="' + (p.w-17) + '" y="' + (p.h-9) + '" text-anchor="middle">⊞</text></g>' : '') +
         (n.delta === true ? '<polygon class="dvdelta" points="-3,-4 8,-4 2.5,-13" aria-hidden="true"/>' : '') +
         '</g>';
  });
  s += '</svg>';
  el.innerHTML = s;
  var svg = el.firstChild;
  var nodeEls = {};
  Object.keys(d.nodes).forEach(function(id){
    var node = document.getElementById(prefix + '-n-' + id);
    if (node) nodeEls[id] = node;
  });
  el._nodeBacklinks=wireNodeBacklinks(el, svg, d, prefix, backlinks);
  el._nodeLinks=wireNodeReferences(el,svg,d,prefix);

  /* measured pass: labels, coins, ambient loop dots, manual step dots */
  var stepByEdge = {};
  (d.steps || []).forEach(function(st, i){
    var keys = stepDeliveredKeys(st);
    if (keys.length && !(keys[0] in stepByEdge) && edgeIds[keys[0]]) stepByEdge[keys[0]] = i + 1;
  });

  var coinRects = [], deltaRects = [], labelEls = [], pendingLabelBadges = [];
  function deltaBadge(parent, x, y, w, h){
    var badge = document.createElementNS(SVGNS, 'polygon');
    badge.setAttribute('class', 'dvdelta');
    badge.setAttribute('aria-hidden', 'true');
    badge.setAttribute('points', x + ',' + (y + h) + ' ' + (x + w) + ',' + (y + h) + ' ' + (x + w/2) + ',' + y);
    parent.appendChild(badge);
    deltaRects.push({x:x - 1, y:y - 1, w:w + 2, h:h + 2});
    return badge;
  }
  (d.edges || []).forEach(function(e){
    var info = edgeIds[e.from + '->' + e.to];
    var path = document.getElementById(info.domId);
    info.pathEl = path;
    info.haloEl = svg.querySelector('path.halo[data-dv-edge=\"' + info.idx + '\"]');
    var len = path.getTotalLength();
    var mid = path.getPointAtLength(len * 0.5);
    var wrap = isWrap(e, L);
    var stepN = stepByEdge[e.from + '->' + e.to];

    if (stepN){
      var g = document.createElementNS(SVGNS, 'g');
      var stepDelta = d.steps[stepN - 1].delta === true;
      g.setAttribute('class', 'coin' + (stepDelta ? ' dvd' : ''));
      g.setAttribute('id', prefix + '-coin-' + stepN);
      g.setAttribute('data-dv-step', String(d._sourceIndices ? d._sourceIndices[stepN - 1] : stepN - 1));
      markFragmentElement(g, e);
      var c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', mid.x); c.setAttribute('cy', mid.y); c.setAttribute('r', 10);
      var t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', mid.x); t.setAttribute('y', mid.y + 3.5); t.setAttribute('text-anchor', 'middle');
      t.textContent = stepN;
      g.appendChild(c); g.appendChild(t); svg.appendChild(g); info.coinEl = g;
      if (stepDelta) deltaBadge(g, mid.x + 5, mid.y - 14, 8, 7);
      coinRects.push({x: mid.x - 11, y: mid.y - 11, w: 22, h: 22});
    }
    if (e.label){
      var lx = mid.x + (e.labelDx || 0), ly = mid.y - (stepN ? 16 : 9) + (e.labelDy || 0);
      var anchor = 'middle';
      if (wrap){
        var wrapsRight = L.pos[e.from].row % 2 === 0;
        anchor = wrapsRight ? 'end' : 'start';
        lx = mid.x + (wrapsRight ? -18 : 18) + (e.labelDx || 0);
        ly = mid.y - 4 + (e.labelDy || 0);
      }
      var lt = document.createElementNS(SVGNS, 'text');
      lt.setAttribute('class', 'lbl' + (e.delta === true ? ' dvd' : '')); lt.setAttribute('x', lx); lt.setAttribute('y', ly);
      lt.setAttribute('text-anchor', anchor);
      lt.setAttribute('data-dv-edge', String(info.idx));
      lt.textContent = e.label;
      markFragmentElement(lt, e);
      svg.appendChild(lt);
      labelEls.push({el: lt, fixed: !!(e.labelDx || e.labelDy), badge: e.delta === true});
      info.labelEl = lt; /* stepper lights the label together with its edge */
    }
    if (e.delta === true){
      if (e.label){
        /* labeled edges wear the badge at the label's top-right; created
           after the collision pass so it sits on the label's FINAL position
           (author labelDx/labelDy nudges included — a committed label drag
           re-renders the board, which re-places the badge) */
        pendingLabelBadges.push({e: e, lbl: lt});
      } else {
        /* no label: left of the coin, near the midpoint */
        var badge = deltaBadge(svg, mid.x - (stepN ? 25 : 16), mid.y - 6, 11, 9);
        markFragmentElement(badge, e);
      }
    }
  });

  /* B1: measured label collision pass — nudge labels off nodes, coins, paths,
     and each other. Author-nudged labels are fixed obstacles. */
  (function(){
    if (!labelEls.length) return;
    var obstacles = [];
    Object.keys(d.nodes).forEach(function(id){
      var p = L.pos[id];
      if (p) obstacles.push({x: p.cx - p.w/2 - 2, y: p.cy - p.h/2 - 2, w: p.w + 4, h: p.h + 4});
      if (p && d.nodes[id] && d.nodes[id].delta === true)
        obstacles.push({x:p.cx - p.w/2 - 4, y:p.cy - p.h/2 - 14, w:13, h:11});
    });
    coinRects.forEach(function(r){ obstacles.push(r); });
    deltaRects.forEach(function(r){ obstacles.push(r); });
    (d.edges || []).forEach(function(e){
      var info = edgeIds[e.from + '->' + e.to];
      var path = document.getElementById(info.domId);
      var len = path.getTotalLength();
      for (var t = 18; t < len - 8; t += 36){
        var pt = path.getPointAtLength(t);
        obstacles.push({x: pt.x - 3, y: pt.y - 3, w: 6, h: 6});
      }
    });
    var rects = labelEls.map(function(le){
      var b;
      try { b = le.el.getBBox(); } catch (ex) { b = null; }
      if (!b || !b.width) return {x: 0, y: 0, w: 0, h: 0, fixed: true};
      var r = {x: b.x, y: b.y, w: b.width, h: b.height, fixed: le.fixed};
      /* a delta-marked label carries a badge at its top-right — reserve
         that room so neighboring labels dodge the badge too */
      if (le.badge){ r.y -= 9; r.h += 9; r.w += 12; }
      return r;
    });
    var nudges = resolveLabelCollisions(rects, obstacles);
    labelEls.forEach(function(le, i){
      var n = nudges[i];
      if (!n.dx && !n.dy) return;
      le.el.setAttribute('x', parseFloat(le.el.getAttribute('x')) + n.dx);
      le.el.setAttribute('y', parseFloat(le.el.getAttribute('y')) + n.dy);
    });
  })();

  /* badges for labeled delta edges — after the collision pass, at each
     label's settled top-right corner */
  pendingLabelBadges.forEach(function(pb){
    var b;
    try { b = pb.lbl.getBBox(); } catch (ex){ b = null; }
    var badge = (b && b.width) ?
      deltaBadge(svg, b.x + b.width + 3, b.y - 6, 9, 8) :
      /* hidden-context fallback (a section inside an inactive tab measures
         as zero): sit just above-right of the label's anchor point */
      deltaBadge(svg, parseFloat(pb.lbl.getAttribute('x')) + 4,
                 parseFloat(pb.lbl.getAttribute('y')) - 18, 9, 8);
    markFragmentElement(badge, pb.e);
  });

  function makeDot(info, cls){
    var col = kindColor(protos, info.kind, skinBase(skin));
    var dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('class', cls + ' dv-protocol-fill' + (info.e.delta === true ? ' dvd' : ''));
    dot.setAttribute('r', SK.glow ? 4 : 3.4);
    dot.setAttribute('fill', col);
    dot.setAttribute('style', protocolColorStyle(protos, info.kind));
    markFragmentElement(dot, info.e);
    return dot;
  }
  function motion(domId, dur, begin, freeze, id){
    var am = document.createElementNS(SVGNS, 'animateMotion');
    am.setAttribute('dur', dur.toFixed(2) + 's');
    am.setAttribute('begin', begin);
    if (freeze){ am.setAttribute('fill', 'freeze'); }
    else { am.setAttribute('repeatCount', 'indefinite'); }
    if (id) am.setAttribute('id', id);
    var mp = document.createElementNS(SVGNS, 'mpath');
    mp.setAttribute('href', '#' + domId);
    mp.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + domId);
    am.appendChild(mp);
    return am;
  }

  /* ambient loop dots: every edge of every step, staggered */
  (d.steps || []).forEach(function(st, i){
    stepDeliveredKeys(st).forEach(function(k, j){
      var info = edgeIds[k];
      if (!info) return;
      var path = document.getElementById(info.domId);
      var dur = Math.max(1.6, path.getTotalLength() / 260);
      var dot = makeDot(info, 'pkt loopdot');
      dot.appendChild(motion(info.domId, dur, (-(i * 0.7 + j * 0.35)).toFixed(2) + 's', false));
      svg.appendChild(dot);
    });
  });

  /* manual step dots: one per unique step edge, fired by the stepper */
  var manualDone = {};
  (d.steps || []).forEach(function(st){
    stepDeliveredKeys(st).forEach(function(k){
      var info = edgeIds[k];
      if (!info || manualDone[k]) return;
      manualDone[k] = true;
      var path = document.getElementById(info.domId);
      var dur = clamp(path.getTotalLength() / 450, 0.8, 1.6);
      var dot = makeDot(info, 'pkt cpkt');
      dot.appendChild(motion(info.domId, dur, 'indefinite', true, prefix + '-am-' + info.idx));
      svg.appendChild(dot);
    });
  });

  return {kindsUsed: Object.keys(kindsUsed), anyRet: anyRet, edgeIds: edgeIds,
    nodeEls: nodeEls, svg: svg};
}

function legendHTML(kinds, anyRet, skin, protos){
  var h = '';
  kinds.forEach(function(k){
    var col = kindColor(protos, k, skinBase(skin));
    var style = protocolColorStyle(protos, k);
    h += '<span class="li"><svg viewBox="0 0 40 10" aria-hidden="true">' +
         '<line class="dv-protocol-stroke" style="' + style + '" x1="1" y1="5" x2="31" y2="5" stroke="' + col + '" stroke-width="2.2" stroke-dasharray="' + DASH_MAIN + '" stroke-linecap="round"/>' +
         '<path class="dv-protocol-fill" style="' + style + '" d="M31 1.5 39 5 31 8.5z" fill="' + col + '"/></svg>' + esc((protos[k] || {}).label || k) + '</span>';
  });
  if (anyRet){
    var nc = SKINS[skinBase(skin)].retNeutral;
    var neutralStyle = '--dv-aurora:' + SKINS.aurora.retNeutral + ';--dv-daylight:' + SKINS.daylight.retNeutral;
    h += '<span class="li"><svg viewBox="0 0 40 10" aria-hidden="true">' +
         '<line class="dv-protocol-stroke" style="' + neutralStyle + '" x1="1" y1="5" x2="31" y2="5" stroke="' + nc + '" stroke-width="1.9" stroke-dasharray="' + DASH_RET + '" stroke-linecap="round"/>' +
         '<path class="dv-protocol-fill" style="' + neutralStyle + '" d="M31 1.5 39 5 31 8.5z" fill="' + nc + '"/></svg>response / ack (fine dash, protocol color)</span>';
  }
  return h;
}

/* ---------------- pure widget models (node-testable, no DOM) ---------------- */
function pointInPoly(x, y, points){
  var inside = false;
  for (var i = 0, j = points.length - 1; i < points.length; j = i++){
    var xi = points[i][0], yi = points[i][1], xj = points[j][0], yj = points[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
/* Whole-home geometry is bounded before any value reaches SVG. */
/* Specs remain in the 320×180 authoring frame. The taller display spreads
   positions vertically, while device/person glyphs and labels keep their shape. */
function inlineMarkup(s){
  var e = esc(s);
  e = e.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function(m, label, url){
    return '<a class="ilink" href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
  });
  e = e.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');       /* bold before italic */
  e = e.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*/g, '$1<em>$2</em>'); /* remaining single stars */
  e = e.replace(/`([^`]+)`/g, '<code>$1</code>');
  return e;
}

/* Page-level document provenance. Kept as a pure string builder so the URL
   safety and separator rules stay independently testable without a DOM. */
function generatedFromHTML(source){
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      typeof source.url !== 'string') return '';
  var label = typeof source.label === 'string' ? source.label : 'source document';
  var shown = esc(label);
  if (/^https?:\/\//i.test(source.url)){
    shown = '<a href="' + esc(source.url) + '" target="_blank" rel="noopener">' + shown + '</a>';
  }
  var parts = [shown];
  if (typeof source.version === 'string') parts.push(esc(source.version));
  if (typeof source.at === 'string') parts.push(esc(source.at));
  return '<p class="generated-from">Generated from ' + parts.join(' · ') + '</p>';
}

/* bullets, with optional nesting. Each item is a string, or an object
   {text, sub:[...items], revealAt?, hideAt?} whose sub-list renders as an indented child <ul>.
   Recursive so the source doc's nested bullet structure carries over. Pure
   string builder (no DOM) so node tests cover it. */
function bulletsHTML(items, markTop){
  /* markTop: tag top-level items with their spec index (workbench
     click-to-definition); sub-lists stay unmarked so a click inside one
     resolves to its top-level parent */
  if (!Array.isArray(items) || !items.length) return '';
  var h = '<ul class="sec-bullets">';
  items.forEach(function(b, i){
    var mark = markTop ? ' data-dv-bullet="' + i + '"' : '';
    if (b && typeof b === 'object' && !Array.isArray(b)){
      h += '<li' + mark + fragmentAttrs(b) + '>' + inlineMarkup(b.text != null ? String(b.text) : '');
      if (Array.isArray(b.sub) && b.sub.length) h += bulletsHTML(b.sub);
      h += '</li>';
    } else {
      h += '<li' + mark + '>' + inlineMarkup(String(b)) + '</li>';
    }
  });
  return h + '</ul>';
}

/* message-contract card: an "on the wire" field table for a section.
   Pure string builder (no DOM) so node tests cover it. Malformed input
   renders as little as possible; the validator carries the warnings. */
/* Copy-link controls are icon-only: a tiny chain-link glyph, swapped for a
   check or a cross as transient click feedback. Strokes follow currentColor
   so each skin's chip color applies unchanged. */
var COPY_ICON = '<svg class="copyglyph" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6.6 9.4l2.8-2.8"/><path d="M8.3 4.6l1.4-1.4a2.55 2.55 0 0 1 3.6 3.6l-1.4 1.4"/><path d="M7.7 11.4l-1.4 1.4a2.55 2.55 0 0 1-3.6-3.6l1.4-1.4"/></svg>';
var COPY_OK_ICON = '<svg class="copyglyph" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 8.6l3.1 3.1 6.5-7.4"/></svg>';
var COPY_FAIL_ICON = '<svg class="copyglyph" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
/* embed-link chip: a small frame glyph — copies the #embed= URL that
   shows just this section's diagram (for iframes / direct links) */
var EMBED_ICON = '<svg class="copyglyph" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M5.4 8h5.2M8.6 6l2 2-2 2"/></svg>';

function contractCardHTML(contract, sectionReference){
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return '';
  var addressed = (typeof sectionReference === 'number' && sectionReference > 0) ||
                  (typeof sectionReference === 'string' && sectionReference.length > 0);
  var sectionAddress = addressed ? esc(String(sectionReference)) : '';
  var h = '<div class="ctcard"' + (addressed ? ' id="contract-' + sectionAddress + '"' : '') + '>';
  var src = (contract.source && typeof contract.source === 'string') ?
    ' <a class="srcchip" href="' + esc(contract.source) + '" target="_blank" rel="noopener">source &#8599;</a>' : '';
  if (contract.title || src || addressed){
    h += '<div class="cttitle"><span>' + esc(contract.title || 'On the wire') + src + '</span>';
    if (addressed) h += '<button type="button" class="copychip contractcopy" title="Copy link" aria-label="Copy link to this contract card">' + COPY_ICON + '</button>';
    h += '</div>';
  }
  var rows = Array.isArray(contract.fields) ? contract.fields : [];
  var body = '', renderedRow = 0;
  rows.forEach(function(f, fi){
    if (!f || typeof f !== 'object' || !f.k) return;
    renderedRow++;
    var link = (f.link && typeof f.link === 'string') ?
      ' <a class="ctlink" href="' + esc(f.link) + '" target="_blank" rel="noopener" aria-label="Source for ' +
      esc(f.k) + '">&#8599;</a>' : '';
    var delta = ['added','removed','changed'].indexOf(f.delta) >= 0 ? f.delta : null;
    var badge = delta ? ' <span class="ctdelta" aria-label="' + delta + ' field">' + delta + '</span>' : '';
    body += '<tr class="ctrow' + (f.hot === true ? ' hot' : '') +
            (delta ? ' delta-' + delta : '') + '"' +
            ' data-dv-crow="' + fi + '"' + /* spec index — malformed rows are skipped, so the rendered position can lag it */
            (addressed ? ' id="contract-' + sectionAddress + '-row-' + renderedRow +
             '" tabindex="-1" aria-label="Contract field ' + esc(f.k) + '"' : '') +
            fragmentAttrs(f) + '>' +
            '<td class="ctk"><span class="ctkey">' + esc(f.k) + link + '</span>' + badge + '</td>' +
            '<td class="ctv">' + (f.v != null ? esc(f.v) : '') + '</td>' +
            '<td class="ctg">' + (f.g != null ? esc(f.g) : '') + '</td></tr>';
  });
  if (body) h += '<table class="cttable">' + body + '</table>';
  if (contract.note) h += '<div class="ctnote">' + inlineMarkup(contract.note) + '</div>';
  h += '</div>';
  return h;
}


/* ---------------- software state panels ---------------- */
/* ---------------- inspector panel widgets ----------------
   Each widget renders ABSOLUTE state (from foldPanelStates) — no deltas, so
   any step jump is consistent. renderPanelBody rebuilds the widget's DOM.
   `states`/`stepIdx` (optional) are the panel's FULL folded per-step state
   array and the current index — the thermo sparkline plots the whole series
   and reveals it up to the current step. */
/* Runtime evidence is transient per-step state. Labels remain readable when
   animation is reduced or the service board is hidden behind a Home view. */
function renderRuntimeConditions(board, host, conditions){
  conditions = Array.isArray(conditions) ? conditions : [];
  Object.keys(board.nodeEls || {}).forEach(function(id){
    var node=board.nodeEls[id];
    if(node.querySelectorAll)node.querySelectorAll('.runtime-node-badge').forEach(function(e){e.remove();});
  });
  if(host){host.textContent='';host.hidden=!conditions.length;}
  var symbols={'service-error':'!','delivery-failed':'×','slow':'◷','database-slow':'◷','queue-buildup':'▤','backpressure':'⇤','retry':'↻','unknown':'?','ambiguous':'?'};
  var grouped=Object.create(null);
  conditions.forEach(function(c){
    if(host){var chip=document.createElement('span');chip.className='runtime-chip runtime-'+c.kind;chip.textContent=(symbols[c.kind] || '!')+' '+c.label;host.appendChild(chip);}
    if(c.nodeId && Object.prototype.hasOwnProperty.call(board.nodeEls,c.nodeId)){if(!grouped[c.nodeId])grouped[c.nodeId]=[];grouped[c.nodeId].push(c);}
  });
  Object.keys(grouped).forEach(function(id){
    var node=board.nodeEls[id],items=grouped[id],c=items[0],card=node.querySelector('.card');
    var badge=document.createElementNS(SVGNS,'g');badge.setAttribute('class','runtime-node-badge runtime-'+c.kind);
    badge.setAttribute('transform','translate('+(Number(card.getAttribute('width') || card.getAttribute('data-node-width'))-12)+' '+(Number(card.getAttribute('height') || card.getAttribute('data-node-height'))-10)+')');
    var title=document.createElementNS(SVGNS,'title');title.textContent=items.map(function(v){return v.label;}).join('; ');badge.appendChild(title);
    var circle=document.createElementNS(SVGNS,'circle');circle.setAttribute('r','11');badge.appendChild(circle);
    var text=document.createElementNS(SVGNS,'text');text.setAttribute('text-anchor','middle');text.setAttribute('y','4');text.textContent=symbols[c.kind] || '!';badge.appendChild(text);node.appendChild(badge);
  });
}

/* ---------------- stepper (click-through) ---------------- */
function attachStepper(secBox, boardDiv, termbar, d, prefix, board, lanes, panelCtl, onChange, options){
  var autoplay = d.autoplay === true && (!options || options.autoplay !== false);
  var destroyed = false;
  var hidden = false, resumeOnShow = false;
  var source = d, paths = diagramPathList(source), selectedPath = paths[0];
  var visibleStepIds=null,editingStep=null;
  function viewPath(path){
    return Object.assign({},path,{indices:path.indices.filter(function(index){return index===editingStep || !visibleStepIds || visibleStepIds.indexOf(source.steps[index].id)>=0;})});
  }
  function stops(path){
    path=path || selectedPath;
    return path.indices.map(function(index,i){return index===editingStep || !visibleStepIds || visibleStepIds.indexOf(source.steps[index].id)>=0?i:-1;}).filter(function(i){return i>=0;});
  }
  var explicitPaths = Array.isArray(source.paths) && source.paths.length > 0;
  d = diagramForPath(source, selectedPath.id);
  var toneStates = foldNodeTones(d);
  function playbackSteps(diagram){ return (diagram.steps || []).map(function(st){
    return {keys: stepDeliveredKeys(st).filter(function(k){ return board.edgeIds[k]; }),
            failures: stepFailures(st),
            nodes: stepNodes(st),
            delta: !!(st && st.delta === true),
            id: (st && typeof st.id === 'string') ? st.id : null,
            lane: (st && typeof st.lane === 'string') ? st.lane : null,
            packets: (st && Array.isArray(st.packets)) ? st.packets : null,
            text: (st && st.text) || '',
            link: (st && typeof st.link === 'string') ? st.link : null,
            codeRefs:st && st.codeRefs,conditions:st && st.conditions};
  }); }
  var steps = playbackSteps(d);
  var N = steps.length;
  var cur = 0, paintedStep = null, timer = null, mode = 'ambient';
  var pending = [];
  var svg = board.svg;

  var btnAmb = termbar.btnAmb, btnStep = termbar.btnStep;
  var bar = termbar.bar, chipsBox = termbar.chips, stepN = termbar.stepN,
      stepText = termbar.stepText, btnPlay = termbar.btnPlay;
  var captionLine = stepN.parentNode, captionGhost = null, captionTimer = null;

  var chipButtons = [], pathButtons = [];
  function paintStepCoins(){
    var visible=stops();
    svg.querySelectorAll('.coin[data-dv-step]').forEach(function(coin){
      var index=selectedPath.indices.indexOf(Number(coin.getAttribute('data-dv-step'))),position=visible.indexOf(index);
      coin.classList.toggle('view-step-hidden',position<0);
      var text=coin.querySelector('text');if(text && position>=0)text.textContent=String(position+1);
    });
  }
  function paintChips(){
    paintStepCoins();
    while (chipsBox.firstChild) chipsBox.removeChild(chipsBox.firstChild);
    chipButtons = []; pathButtons = [];
    function appendStep(parent,path,idx,rowNumber,sharedWith){
      var step = source.steps[path.indices[idx]], b = document.createElement('button');
      var fullPath=paths.find(function(p){return p.id===path.id;}),fullIndex=fullPath.indices.indexOf(path.indices[idx]);
      b.type = 'button'; b.className = 'schip' + (step && step.delta === true ? ' dvd' : '') + (sharedWith ? ' shared-step-shadow' : '');
      b.textContent = idx + 1;
      b.setAttribute('data-step-source',path.indices[idx]);
      b.setAttribute('aria-label','Go to step ' + (idx + 1) + (paths.length > 1 ? ' on ' + path.label : '') +
        (sharedWith ? ', shared with ' + sharedWith.label : ''));
      if (sharedWith){
        b.title = 'Shared with ' + sharedWith.label;
        b.style.setProperty('--path-color',sharedWith.color);
      }
      if (paths.length > 1){
        b.setAttribute('data-step-path',path.id);
        b.style.gridColumn = idx + 2; b.style.gridRow = rowNumber + 1;
      }
      b.addEventListener('click',function(){
        stopAuto();
        if (path.id !== selectedPath.id){
          selectPath(path.id,fullIndex);
          secBox.dispatchEvent(new CustomEvent('dv:pathchange',{bubbles:true}));
        } else setStep(fullIndex);
      });
      parent.appendChild(b);
      chipButtons.push({button:b, path:path, index:fullIndex});
    }
    if (paths.length < 2){
      var only=viewPath(selectedPath);only.indices.forEach(function(unused,idx){appendStep(chipsBox,only,idx,0);});
      return;
    }
    var matrix = document.createElement('div'); matrix.className = 'path-matrix';
    matrix.setAttribute('role','group'); matrix.setAttribute('aria-label','Execution paths');
    var shownPaths=paths.map(viewPath);
    matrix.style.setProperty('--path-step-count',Math.max(1,Math.max.apply(null,shownPaths.map(function(p){return p.indices.length;}))));
    pathStepRows(shownPaths).forEach(function(row,rowNumber){
      var path = row.path, line = document.createElement('div'); line.className = 'path-row';
      line.setAttribute('role','group');
      line.setAttribute('aria-label',path.label + ', steps 1 through ' + (row.end + 1) +
        (row.start > row.end ? ', all steps shared' : row.start ? ', shared steps before fork at ' + (row.start + 1) : ''));
      line.setAttribute('data-path-row',path.id); line.style.setProperty('--path-color',path.color);
      var choice = document.createElement('button'); choice.type = 'button'; choice.className = 'path-chip';
      choice.textContent = path.label; choice.setAttribute('data-dv-path',path.id);
      choice.disabled=!path.indices.length;
      if(choice.disabled)choice.title='No steps from this path are shown in this view.';
      choice.style.gridColumn = 1; choice.style.gridRow = rowNumber + 1;
      choice.addEventListener('click',function(ev){
        ev.stopPropagation();clearEditingPreview();selectPath(path.id,0);
        secBox.dispatchEvent(new CustomEvent('dv:pathchange',{bubbles:true}));
      });
      line.appendChild(choice); pathButtons.push({button:choice,path:path,row:line});
      for (var i = 0; i <= row.end; i++){
        /* Copy only real shared beats. Nested forks inherit each beat's
           earliest matching path color, including another alternate. */
        var sharedWith = i < row.start ? shownPaths.slice(0,rowNumber).find(function(prior){
          return prior.indices[i] === path.indices[i];
        }) : null;
        appendStep(line,path,i,rowNumber,sharedWith);
      }
      matrix.appendChild(line);
    });
    chipsBox.appendChild(matrix);
  }
  function syncPathControls(){
    pathButtons.forEach(function(choice){
      var active = choice.path.id === selectedPath.id;
      choice.button.setAttribute('aria-pressed',String(active));
      choice.row.setAttribute('data-selected',String(active));
    });
    var active = chipButtons.find(function(chip){return chip.path.id === selectedPath.id && chip.index === cur;});
    chipButtons.forEach(function(chip){chip.button.setAttribute('aria-current',String(chip === active));});
  }
  paintChips();

  function clearLit(){
    clearCommunicationFailures(board);
    pending.forEach(function(t){ clearTimeout(t); });
    pending = [];
    var lit = svg.querySelectorAll('.lit'), j;
    for (j = 0; j < lit.length; j++) lit[j].classList.remove('lit');
    var dots = svg.querySelectorAll('.cpkt');
    for (j = 0; j < dots.length; j++) dots[j].style.visibility = 'hidden';
  }
  function fireDot(key, delayMs){
    var info = board.edgeIds[key];
    if (!info || RM) return;
    var am = document.getElementById(prefix + '-am-' + info.idx);
    if (!am) return;
    var go = function(){
      if (destroyed) return;
      am.parentNode.style.visibility = 'visible';
      try { am.beginElement(); } catch (ex) {}
    };
    if (delayMs > 0) pending.push(setTimeout(go, delayMs));
    else go();
  }
  function clearCaptionTween(){
    if (captionTimer){ clearTimeout(captionTimer); captionTimer = null; }
    if (captionGhost && captionGhost.parentNode) captionGhost.parentNode.removeChild(captionGhost);
    captionGhost = null;
    if (captionLine && captionLine.classList) captionLine.classList.remove('dv-caption-new');
  }
  function updateCaption(s, tween){
    clearCaptionTween();
    if (tween && captionLine && captionLine.cloneNode && captionLine.getBoundingClientRect){
      var lineRect = captionLine.getBoundingClientRect();
      var barRect = bar.getBoundingClientRect();
      captionGhost = captionLine.cloneNode(true);
      captionGhost.classList.add('dv-caption-old');
      captionGhost.setAttribute('aria-hidden', 'true');
      captionGhost.style.left = (lineRect.left - barRect.left) + 'px';
      captionGhost.style.top = (lineRect.top - barRect.top) + 'px';
      captionGhost.style.width = lineRect.width + 'px';
      captionGhost.style.height = lineRect.height + 'px';
      bar.appendChild(captionGhost);
    }
    var visible=stops();stepN.textContent = 'STEP ' + (visible.indexOf(cur) + 1) + '/' + visible.length;
    termbar.lanePill.hidden = !s.lane;
    if (s.lane){
      var lm = lanes[s.lane] || {label: s.lane, color: LANE_FALLBACK};
      termbar.lanePill.textContent = lm.label;
      termbar.lanePill.style.color = lm.color;
      termbar.lanePill.style.borderColor = lm.color;
    }
    stepText.textContent = s.text;
    if(termbar.evidenceLinks && typeof FlowCanon!=='undefined'){
      var stepLinks=FlowCanon.links(s);termbar.evidenceLinks.innerHTML='';
      appendCanonLinks(termbar.evidenceLinks,stepLinks);termbar.evidenceLinks.hidden=!stepLinks.length;
    }
    if (termbar.failureStatus){
      var failures = communicationFailureText(source,s.failures);
      termbar.failureStatus.textContent = failures; termbar.failureStatus.hidden = !failures;
    }
    if (termbar.stepIdEl){
      termbar.stepIdEl.textContent = s.id || '';
      termbar.stepIdEl.hidden = !s.id;
    }
    if (s.link){ termbar.srcA.href = s.link; termbar.srcA.hidden = false; }
    else { termbar.srcA.hidden = true; }
    if (captionGhost){
      captionLine.classList.add('dv-caption-new');
      captionTimer = setTimeout(clearCaptionTween, 420);
    }
  }
  function setStep(i, claimAddressBar, narrativePath){
    if (destroyed || !N) return;
    var visible=stops();if(!visible.length)return;
    var first=visible[0],last=visible[visible.length-1];
    var target=i;
    if(!visibleStepIds && !explicitPaths)target=((i%N)+N)%N;
    else if(i>last)target=explicitPaths || narrativePath===false?last:first;
    else if(i<first)target=explicitPaths || narrativePath===false?first:last;
    else if(visible.indexOf(i)<0)target=i<cur?visible.filter(function(n){return n<i;}).pop():visible.find(function(n){return n>i;});
    var tween = shouldTweenStep(paintedStep, target, RM, narrativePath);
    var tonePulses = tonePulseNodes(toneStates, paintedStep, target, RM, narrativePath);
    if (tween) boardDiv.classList.add('dv-step-tween');
    else boardDiv.classList.remove('dv-step-tween');
    cur = target;
    clearLit();
    applyNodeTones(board.nodeEls, nodeTonesAt(toneStates, cur, true), tonePulses);
    setFragmentStep(secBox, cur, true);
    var s = steps[cur];
    renderRuntimeConditions(board,termbar.runtimeStatus,s.conditions);
    s.keys.forEach(function(key){
      var info = board.edgeIds[key];
      var pe = document.getElementById(info.domId);
      if (pe) pe.classList.add('lit');
      if (info.labelEl) info.labelEl.classList.add('lit');
    });
    applyStepNodeFocus(board.nodeEls, s, board.edgeIds);
    showCommunicationFailures(board,s.failures,!RM);
    /* ordered packet chain: explicit packets list, else edges in step order */
    if (s.packets){
      s.packets.forEach(function(pk){
        if (!Object.prototype.hasOwnProperty.call(s.failures,pk.edge)) fireDot(pk.edge, Math.max(0, (pk.delay || 0) * 1000));
      });
    } else {
      s.keys.forEach(function(key, j){ fireDot(key, j * 450); });
    }
    var coin = document.getElementById(prefix + '-coin-' + (cur + 1));
    if (coin) coin.classList.add('lit');
    syncPathControls();
    updateCaption(s, tween);
    if (panelCtl) panelCtl.setStep(cur, tween);
    if (explicitPaths){
      termbar.btnPrev.disabled = cur === first; termbar.btnNext.disabled = cur === last;
      if (cur === last) stopAuto();
    }
    syncPlayback();
    paintedStep = cur;
    if (onChange) onChange(claimAddressBar !== false);
  }
  function startAuto(){
    clearEditingPreview();
    if(!stops().length)selectPath(paths.find(function(p){return stops(p).length;}).id);
    var visible=stops(),last=visible[visible.length-1];
    if (destroyed || timer || RM || visible.length < 2 || mode !== 'step' || hidden || document.hidden) return;
    if (explicitPaths && cur === last) setStep(visible[0], false, false);
    /* the modulo wrap back to step 0 is a jump, not a narrative move */
    var id = window.setInterval(function(){
      if (timer === id) setStep(cur < last ? cur + 1 : explicitPaths ? last : visible[0], false, cur < last ? undefined : false);
    }, 3000);
    timer = id;
    syncPlayback();
  }
  function stopAuto(){
    if (timer){ window.clearInterval(timer); timer = null; }
    resumeOnShow = false;
    syncPlayback();
  }
  function syncPlayback(){
    var visible=stops(),count=visible.length;
    var ended = explicitPaths && count > 1 && cur === visible[count-1];
    var state = timer ? 'playing' : ended ? 'finished' : 'paused';
    var action = timer ? 'Pause' : ended ? 'Replay' : 'Play';
    btnPlay.innerHTML = '<span aria-hidden="true">' + (timer ? '&#10074;&#10074;' : '&#9654;') + '</span> ' + action;
    btnPlay.setAttribute('aria-label', action);
    btnPlay.disabled = RM || count < 2;
    btnPlay.title = RM ? 'Automatic steps are disabled by reduced motion. Use the step arrows.' :
      count < 2 ? 'This view shows only one step on this path.' : timer ? 'Pause automatic step advancement' :
      ended ? 'Play this path again from step 1' : 'Advance one step every 3 seconds';
    bar.setAttribute('data-playback', state);
    var label = timer ? 'Playing · 3s / step' : count < 2 ? 'Single step' : RM ? 'Paused · reduced motion' : ended ? 'Finished' : 'Paused';
    if(editingStep!==null)label+=' · Previewing a hidden step';
    if (termbar.playbackStatus && termbar.playbackStatus.textContent !== label) termbar.playbackStatus.textContent = label;
  }
  function visibilityChanged(){
    if (document.hidden && !destroyed){ stopAuto(); if (mode === 'step') settleCurrentStep(); }
  }
  function selectPath(id, at){
    if (destroyed) return false;
    var next = paths.find(function(p){ return p.id === id; });
    if (!next || !stops(next).length) return false;
    if (next === selectedPath){
      if (mode !== 'step') enterStep(false);
      stopAuto(); setStep(at == null || at===0 ? stops(next)[0] : at,true,false);
      return true;
    }
    stopAuto(); clearLit(); clearCaptionTween();
    selectedPath = next; d = diagramForPath(source,id);
    steps = playbackSteps(d); N = steps.length; toneStates = foldNodeTones(d); paintedStep = null;
    if (options && options.renderPath){ board = options.renderPath(d); svg = board.svg; }
    paintStepCoins();
    if (panelCtl && panelCtl.setDiagram) panelCtl.setDiagram(d);
    mode = 'step'; boardDiv.classList.add('stepmode'); bar.hidden = false; syncToggle();
    setStep(at == null || at===0 ? stops(next)[0] : at, true, false);
    if (secBox.dispatchEvent) secBox.dispatchEvent(new CustomEvent('dv:pathrender',{bubbles:true}));
    return true;
  }
  function settleCurrentStep(){
    settleCommunicationFailures(board);
    pending.forEach(function(t){ clearTimeout(t); });
    pending = [];
    var dots = svg.querySelectorAll('.cpkt');
    for (var i = 0; i < dots.length; i++) dots[i].style.visibility = 'hidden';
    boardDiv.classList.remove('dv-step-tween');
    clearCaptionTween();
    applyNodeTones(board.nodeEls, nodeTonesAt(toneStates, cur, true), []);
    if (panelCtl) panelCtl.setStep(cur, false);
  }
  function syncToggle(){
    btnAmb.setAttribute('aria-pressed', mode === 'ambient' ? 'true' : 'false');
    btnStep.setAttribute('aria-pressed', mode === 'step' ? 'true' : 'false');
  }
  function enterStep(auto){
    if (destroyed) return;
    clearEditingPreview();
    stopAuto();
    mode = 'step';
    boardDiv.classList.add('stepmode');
    bar.hidden = false;
    paintedStep = null;
    setStep(stops()[0], undefined, false);
    if (auto && autoplay) startAuto();
    syncToggle();
  }
  function enterAmbient(){
    if (destroyed) return;
    mode = 'ambient';
    stopAuto();
    clearLit();
    clearCaptionTween();
    paintedStep = null;
    boardDiv.classList.remove('dv-step-tween');
    boardDiv.classList.remove('stepmode');
    applyNodeTones(board.nodeEls, nodeTonesAt(toneStates, 0, false), []);
    renderRuntimeConditions(board,termbar.runtimeStatus,[]);
    bar.hidden = true;
    setFragmentStep(secBox, 0, false);
    syncToggle();
    if (panelCtl) panelCtl.setStep(0, false, true);
    if (onChange) onChange();
  }

  btnAmb.addEventListener('click', enterAmbient);
  btnStep.addEventListener('click', function(){ enterStep(true); });
  btnPlay.addEventListener('click', function(){
    if (timer) stopAuto(); else startAuto();
    if (onChange) onChange(true);
  });
  function clearEditingPreview(){if(editingStep!==null){editingStep=null;paintChips();}}
  function advanceTo(n){stopAuto();clearEditingPreview();if(!stops().length)selectPath(paths.find(function(p){return stops(p).length;}).id);else setStep(n);}
  termbar.btnPrev.addEventListener('click', function(){advanceTo(cur-1);});
  termbar.btnNext.addEventListener('click', function(){advanceTo(cur+1);});
  secBox.addEventListener('click',function(event){
    var button=event.target.closest && event.target.closest('button[data-dv-trace-step]');
    if (!button || !secBox.contains(button)) return;
    var traceCard=button.closest('.pt-trace');
    var index=Number(button.getAttribute('data-dv-trace-step'));
    if (!Number.isInteger(index) || index<0 || index>=N) return;
    event.stopPropagation(); stopAuto();
    if (mode!=='step') enterStep(false);
    setStep(index,false);
    var replacement=(traceCard||secBox).querySelector('button[data-dv-trace-step="'+index+'"]');
    if (replacement) replacement.focus({preventScroll:true});
  });
  secBox.addEventListener('change',function(event){
    if (!event.target.matches || !event.target.matches('select[data-dv-trace-service]')) return;
    var traceCard=event.target.closest('.pt-trace');
    var index=Number(event.target.value);
    if (!Number.isInteger(index) || index<0 || index>=N) return;
    event.stopPropagation(); stopAuto();
    if (mode!=='step') enterStep(false);
    setStep(index,false);
    var replacement=(traceCard||secBox).querySelector('select[data-dv-trace-service]');
    if (replacement) replacement.focus({preventScroll:true});
  });

  if (document.addEventListener) document.addEventListener('visibilitychange', visibilityChanged);
  syncToggle(); syncPlayback();
  return {
    sectionEl: secBox,
    scrollTargetEl: boardDiv,
    enterStep: enterStep,
    enterAmbient: enterAmbient,
    mode: function(){ return mode; },
    path: function(){ return selectedPath.id; },
    paths: function(){ return paths; },
    selectPath: selectPath,
    setVisibleSteps:function(ids){
      var next=Array.isArray(ids)?ids.filter(function(id){return paths.some(function(p){return p.indices.some(function(i){return source.steps[i].id===id;});});}):null;
      if(next && !next.length)next=null; /* malformed filters never strand the viewer */
      if(JSON.stringify(next)===JSON.stringify(visibleStepIds) && editingStep===null)return;
      var playing=!!timer,wasMode=mode;stopAuto();visibleStepIds=next;editingStep=null;paintChips();
      var visible=stops();
      if(!visible.length){selectPath(paths.find(function(p){return stops(p).length;}).id);}
      else if(mode==='step'){
        if(visible.indexOf(cur)<0)setStep(visible.find(function(n){return n>=cur;}) ?? visible[visible.length-1],false,false);
        else{syncPathControls();updateCaption(steps[cur],false);termbar.btnPrev.disabled=explicitPaths && cur===visible[0];termbar.btnNext.disabled=explicitPaths && cur===visible[visible.length-1];}
      }
      syncPlayback();if(playing && (!explicitPaths || cur!==stops().slice(-1)[0]))startAuto();
      if(wasMode==='ambient' && mode!=='ambient')enterAmbient();
      if(options && options.viewSteps)options.viewSteps(visibleStepIds);
    },
    sourceIndex: function(n){ return selectedPath.indices[n == null ? cur : n]; },
    jumpSource: function(index, pathId){
      var path = paths.find(function(p){ return p.id === (pathId || selectedPath.id) && p.indices.indexOf(index) >= 0; }) ||
        paths.find(function(p){ return p.indices.indexOf(index) >= 0; });
      if (!path) return false;
      if(mode!=='step')enterStep(false);
      var preview=visibleStepIds && visibleStepIds.indexOf(source.steps[index].id)<0?index:null;
      if(preview!==editingStep){editingStep=preview;paintChips();}
      if (path.id !== selectedPath.id) selectPath(path.id, path.indices.indexOf(index));
      /* a step pick is a narrative move — it tweens like the arrows */
      else { stopAuto(); setStep(path.indices.indexOf(index),true); }
      return true;
    },
    current: function(){ return {n: cur, id: steps[cur] ? steps[cur].id : null}; },
    ids: function(){ return steps.map(function(s){ return s.id; }); },
    stepIndexOf: function(sref){ return stepIndexOf(steps.map(function(s){ return s.id; }), sref); },
    jump: function(n){ stopAuto(); setStep(n, undefined, false); },
    advance: advanceTo,
    toggleAuto: function(){ if (timer) stopAuto(); else startAuto(); },
    /* Pausing must not replace panel contents: an editor may have focus there. */
    pause: stopAuto,
    destroy: function(){
      destroyed = true; stopAuto(); clearLit(); clearCaptionTween();
      if (document.removeEventListener) document.removeEventListener('visibilitychange', visibilityChanged);
    },
    onHide: function(){ if (!destroyed && !hidden){
      var wasPlaying = !!timer; hidden = true; stopAuto();
      resumeOnShow = wasPlaying && (!options || options.autoplay !== false); settleCurrentStep();
    } },
    onShow: function(){ if (!destroyed){
      hidden = false; settleCurrentStep();
      var resume = resumeOnShow; resumeOnShow = false;
      if (resume) startAuto();
    } }
  };
}

/* ---------------- section + page renderers ---------------- */
function diagramFocusPanel(d){
  var panels = Array.isArray(d.panels) ? d.panels : [];
  return panels.find(function(p){return p && typeof p.id === 'string' && p.id && p.id === d.primaryPanel;}) ||
    panels.find(function(p){return p && typeof p.id === 'string' && p.id && panelCapability(p.type,'focusByDefault',false);}) || null;
}
function createBoardGrid(sectionEl, hasPanels, primaryPanel){
  var toolbar, choices, modes;
  if (hasPanels && primaryPanel){
    toolbar = document.createElement('div'); toolbar.className = 'diagram-views';
    choices = document.createElement('div'); choices.className = 'diagram-view-choice';
    toolbar.appendChild(choices);
    modes = document.createElement('div'); modes.className = 'primary-modes';
    toolbar.appendChild(modes); sectionEl.appendChild(toolbar);
  }
  var grid = document.createElement('div');
  grid.className = 'boardgrid' + (hasPanels ? ' haspanels' : '');
  sectionEl.appendChild(grid);
  if (!hasPanels) return {grid:grid, diagramHost:grid, controlsHost:sectionEl, diagramCol:null};

  if (primaryPanel){
    grid.className += ' panel-first';
    var primary = document.createElement('div'); primary.className = 'primary-panel';
    grid.appendChild(primary);
    var flow = document.createElement('details'); flow.className = 'secondary-flow';
    var summary = document.createElement('summary'); summary.textContent = 'Data flow';
    flow.appendChild(summary);
    /* Keep the secondary board outside the widget grid and in DOM order
       after the map and its playback controls, including on phones. */
    sectionEl.appendChild(flow);
    var flowCol = document.createElement('div'); flowCol.className = 'diagramcol';
    flow.appendChild(flowCol);
    return {grid:grid, diagramHost:flowCol, controlsHost:primary, diagramCol:flowCol,
      primaryHost:primary, modesHost:modes, flowDisclosure:flow, viewChoicesHost:choices};
  }

  var diagramCol = document.createElement('div');
  diagramCol.className = 'diagramcol';
  grid.appendChild(diagramCol);
  return {grid:grid, diagramHost:diagramCol, controlsHost:diagramCol, diagramCol:diagramCol};
}

/* Reader-only layout: move existing elements, preserving widget state, the
   selected path/step, running playback, and board sizing. Never re-render. */
function createDiagramFocusControl(layout, panel, aside, bar, initial, changed){
  var group = layout.viewChoicesHost, buttons = {}, mode = null, destroyed = false;
  group.setAttribute('role','group'); group.setAttribute('aria-label','View focus');
  function setMode(value){
    if (destroyed || ['panel','flow'].indexOf(value) < 0 || value === mode) return;
    mode = value;
    var home = value === 'panel';
    if (home){
      layout.flowDisclosure.appendChild(layout.diagramCol);
      layout.grid.appendChild(aside);
      if (bar) layout.primaryHost.appendChild(bar);
    } else {
      layout.grid.insertBefore(layout.diagramCol, layout.primaryHost);
      if (bar) layout.diagramCol.appendChild(bar);
      layout.primaryHost.appendChild(aside);
    }
    layout.grid.classList.toggle('panel-first',home);
    layout.grid.classList.toggle('flow-first',!home);
    layout.flowDisclosure.hidden = !home;
    buttons.panel.setAttribute('aria-pressed',String(home));
    buttons.flow.setAttribute('aria-pressed',String(!home));
    if (changed) changed(home ? layout.primaryHost : layout.diagramCol);
  }
  [['panel',panelCapability(panel.type,'focusLabel',panel.title || 'Panel')],['flow','Data flow']].forEach(function(choice){
    var button = document.createElement('button'); button.type = 'button'; button.className = 'mbtn';
    button.textContent = choice[1]; button.setAttribute('data-view-focus',choice[0]);
    button.title = 'Make ' + choice[1] + ' the main view';
    button.addEventListener('click',function(){setMode(choice[0]);});
    buttons[choice[0]] = button; group.appendChild(button);
  });
  setMode(initial);
  return {panelId:panel.id, mode:function(){return mode;}, setMode:setMode,
    viewId:function(){return mode==='panel'?'home':'flow';},
    defaultView:function(){return initial==='panel'?'home':'flow';},
    setView:function(id){if(id!=='home' && id!=='flow')return false;setMode(id==='home'?'panel':'flow');return true;},
    destroy:function(){destroyed = true;}};
}

/* Saved section composition moves the existing live widgets, never their state.
   Its named layout replaces Home; Data flow restores the standard placement. */
function sectionLayoutWithoutFlow(items,controlsRows){
  var diagram=items.find(function(it){return sectionLayoutKey(it)==='diagram';});
  var kept=items.filter(function(it){return it!==diagram || controlsRows>0;}).map(function(it){
    var copy=Object.assign({},it);if(it===diagram)copy.h=Math.min(it.h,Math.max(3,controlsRows));return copy;
  });
  if(!diagram)return kept;
  /* Remove only rows vacated by the diagram. Side-by-side panels retain their
     sizes/columns, and intentional spacing elsewhere stays authored. */
  var empty=[];
  for(var row=diagram.y;row<diagram.y+diagram.h;row++){
    if(!kept.some(function(it){return row>=it.y && row<it.y+it.h;}))empty.push(row);
  }
  kept.forEach(function(it){it.y-=empty.filter(function(row){return row<it.y;}).length;});
  return kept;
}
function createSectionComposition(box, layout, d, board, bar, base, target, changed, stepper){
  var definition=sectionLayoutDefinition(d), views=diagramLayoutViews(d), layoutId=definition && definition.id;
  var items=sectionLayoutItems(d,target || 'default',layoutId);
  if(!items)return null;
  var dock=sectionLayoutDock(items),separateSteps=items.some(function(it){return sectionLayoutKey(it)==='steps';}) && dock!=='diagram';
  var named=definition && !definition.legacy;
  var defaultView=named?layoutId:'layout';
  var group=layout.viewChoicesHost;
  if(!group){
    var toolbar=document.createElement('div');toolbar.className='diagram-views';
    group=document.createElement('div');group.className='diagram-view-choice';
    toolbar.appendChild(group);box.insertBefore(toolbar,layout.grid);
  }
  var buttons=Object.create(null);
  views.forEach(function(v){
    var button=document.createElement('button');button.type='button';button.className='mbtn';button.textContent=v.name;
    button.setAttribute('data-view-layout','');button.setAttribute('data-layout-id',v.id);
    button.addEventListener('click',function(){setLayout(v.id);});buttons[v.id]=button;group.appendChild(button);
  });
  /* Keep authored choices before the standard Data flow button. */
  Object.keys(buttons).reverse().forEach(function(id){group.insertBefore(buttons[id],group.firstChild);});
  var homeChoice=group.querySelector('[data-view-focus="panel"]');if(homeChoice)homeChoice.remove();
  if(named)group.querySelectorAll('[data-view-focus]').forEach(function(b){b.remove();});
  var flowToggle=document.createElement('button');flowToggle.type='button';flowToggle.className='mbtn layout-flow-toggle';
  flowToggle.setAttribute('data-layout-flow','');group.parentNode.insertBefore(flowToggle,group.nextSibling);
  var standard;
  if(!base && !named){standard=document.createElement('button');standard.type='button';standard.className='mbtn';standard.textContent='Data flow';standard.setAttribute('data-view-focus','flow');group.appendChild(standard);}
  var grid=document.createElement('div');grid.className='section-layout-grid';grid.hidden=true;
  grid.id=box.id+'-layout';flowToggle.setAttribute('aria-controls',grid.id);
  grid.setAttribute('data-layout-target',target || 'default');box.insertBefore(grid,layout.grid);
  var active=false, saved=[], oldHidden, flowHidden,showDiagram=!items.some(function(it){return sectionLayoutKey(it)==='diagram' && it.hidden;}),boardHidden=board.hidden,visibility=Object.create(null);
  function paintFlow(){
    flowToggle.hidden=!active;flowToggle.textContent=showDiagram?'Hide data flow':'Show data flow';
    flowToggle.setAttribute('aria-expanded',String(showDiagram));
    board.hidden=active && !showDiagram ? true : boardHidden;
    if(!active)return;
    var controlsRows=bar && !bar.hidden && !separateSteps ? sectionLayoutControlsRows(d,items) : 0;
    var visible=items.filter(function(it){return !(dock && it.controls==='steps') && (!it.hidden || sectionLayoutKey(it)==='diagram');});
    if(!showDiagram)visible=sectionLayoutWithoutFlow(visible,controlsRows);
    grid.querySelectorAll('.section-layout-tile').forEach(function(tile){
      var key=tile.getAttribute('data-layout-key'),it=visible.find(function(v){return sectionLayoutKey(v)===key;});
      tile.hidden=!it;tile.classList.toggle('layout-controls-only',key==='diagram' && !showDiagram && !!it);
      if(it){tile.style.setProperty('--tile-y',it.y+1);tile.style.setProperty('--tile-h',it.h);}
    });
  }
  function setDiagramVisible(value){if(typeof value!=='boolean')return;showDiagram=value;visibility[layoutId]=value;paintFlow();}
  flowToggle.addEventListener('click',function(){setDiagramVisible(!showDiagram);});
  var visibilityObserver=bar && typeof MutationObserver!=='undefined' ? new MutationObserver(function(){if(active && !showDiagram)paintFlow();}) : null;
  if(visibilityObserver)visibilityObserver.observe(bar,{attributes:true,attributeFilter:['hidden']});
  function move(node,host){
    if(!node)return;
    var anchor=document.createComment('layout position');node.parentNode.insertBefore(anchor,node);
    saved.push({node:node,anchor:anchor});host.appendChild(node);
  }
  function restore(){
    if(!active)return;
    saved.forEach(function(rec){rec.node.classList.remove('layout-docked-card');if(rec.anchor.parentNode){rec.anchor.parentNode.replaceChild(rec.node,rec.anchor);}});
    saved=[];grid.replaceChildren();grid.hidden=true;layout.grid.hidden=oldHidden;
    if(layout.flowDisclosure)layout.flowDisclosure.hidden=flowHidden;
    active=false;Object.keys(buttons).forEach(function(id){buttons[id].setAttribute('aria-pressed','false');});
    paintFlow();
    if(standard)standard.setAttribute('aria-pressed','true');
    if(changed)changed(base && base.mode()==='panel' ? layout.primaryHost : layout.diagramCol || board);
    if(base)group.querySelectorAll('[data-view-focus]').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-view-focus')===base.mode()));});
  }
  function activate(){
    if(active)return;
    oldHidden=layout.grid.hidden;flowHidden=layout.flowDisclosure && layout.flowDisclosure.hidden;
    var cards=Array.prototype.slice.call(box.querySelectorAll('.pwidget[data-dv-panel]'));
    items.slice().sort(function(a,b){return a.y-b.y || a.x-b.x;}).forEach(function(it){
      if(dock && it.controls==='steps')return;
      var tile=document.createElement('div');tile.className='section-layout-tile';
      var key=sectionLayoutKey(it),panel=(d.panels || []).find(function(p){return p.id===it.panel;});
      tile.setAttribute('data-layout-key',key);tile.setAttribute('data-layout-label',key==='steps' ? 'Step controls' : panel ? panel.title || panel.id : 'Data flow');
      tile.style.setProperty('--tile-x',it.x+1);tile.style.setProperty('--tile-y',it.y+1);
      tile.style.setProperty('--tile-w',it.w);tile.style.setProperty('--tile-h',it.h);
      if(bar && (dock===key || key==='diagram' && !separateSteps)){
        tile.classList.add('layout-has-attached-controls');
        tile.style.setProperty('--attached-controls-height',(sectionLayoutControlsRows(d,items)*40-8)+'px');
      }
      grid.appendChild(tile);
      if(key==='steps'){
        move(bar,tile);
        var hint=document.createElement('div');hint.className='section-steps-placeholder';hint.textContent='Choose Step to show playback controls.';tile.appendChild(hint);
      }else if(it.panel != null){
        var index=(d.panels || []).indexOf(panel),card=cards.find(function(c){return Number(c.getAttribute('data-dv-panel'))===index;});
        move(card,tile);
        if(dock===key && bar && card){card.classList.add('layout-docked-card');move(bar,card);}
      }else if(layout.diagramCol){
        move(layout.diagramCol,tile);
        if(!separateSteps && bar && !layout.diagramCol.contains(bar))move(bar,layout.diagramCol);
      }else{
        var col=document.createElement('div');col.className='diagramcol';tile.appendChild(col);
        move(board,col);if(!separateSteps && bar)move(bar,col);
      }
    });
    /* A board without a primary panel owns the Ambient/Step buttons. Keep
       them reachable when the board is hidden, then restore on Data flow. */
    var boardModes=board.querySelector('.mtoggle');if(boardModes)move(boardModes,group.parentNode);
    layout.grid.hidden=true;if(layout.flowDisclosure)layout.flowDisclosure.hidden=true;
    grid.hidden=false;active=true;grid.setAttribute('data-layout-id',layoutId);
    if(stepper)stepper.setVisibleSteps(sectionLayoutDefinition(d,layoutId).steps);
    Object.keys(buttons).forEach(function(id){buttons[id].setAttribute('aria-pressed',String(id===layoutId));});
    paintFlow();
    if(changed)changed(grid);
    if(standard)standard.setAttribute('aria-pressed','false');
    group.querySelectorAll('[data-view-focus]').forEach(function(b){b.setAttribute('aria-pressed','false');});
  }
  function setMode(value){if(named || value==='layout'||value==='panel')activate();else{restore();if(stepper)stepper.setVisibleSteps(null);if(base)base.setMode(value);}}
  function setLayout(id){
    if(!views.some(function(v){return v.id===id;}))return;
    if(id!==layoutId){
      restore();layoutId=id;items=sectionLayoutItems(d,target || 'default',id);
      dock=sectionLayoutDock(items);separateSteps=items.some(function(it){return sectionLayoutKey(it)==='steps';}) && dock!=='diagram';
      showDiagram=Object.prototype.hasOwnProperty.call(visibility,id)?visibility[id]:!items.some(function(it){return sectionLayoutKey(it)==='diagram' && it.hidden;});
    }
    if(active && stepper)stepper.setVisibleSteps(sectionLayoutDefinition(d,id).steps);
    activate();
  }
  if(standard)standard.addEventListener('click',function(){setMode('flow');});
  group.addEventListener('click',function(ev){if(ev.target.closest('[data-view-focus]')){restore();if(stepper)stepper.setVisibleSteps(null);}},true);
  activate();
  return {panelId:base && base.panelId,mode:function(){return active?'layout':base?base.mode():'flow';},setMode:setMode,
    layoutId:function(){return layoutId;},setLayout:setLayout,
    viewId:function(){return active?(named?layoutId:'layout'):'flow';},
    defaultView:function(){return defaultView;},
    setView:function(id){
      if(named){if(!views.some(function(v){return v.id===id;}))return false;setLayout(id);return true;}
      if(id==='layout' || id==='home'){setMode('layout');return true;}
      if(id==='flow'){setMode('flow');return true;}
      return false;
    },
    diagramVisible:function(){return showDiagram;},setDiagramVisible:setDiagramVisible,
    destroy:function(){if(visibilityObserver)visibilityObserver.disconnect();if(base)base.destroy();}};
}

function sectionHasProse(sec){
  if (!sec || typeof sec !== 'object') return false;
  var hasText = typeof sec.text === 'string' ? sec.text.length > 0 :
                (Array.isArray(sec.text) && sec.text.length > 0);
  return hasText || (Array.isArray(sec.bullets) && sec.bullets.length > 0);
}
function proseToggleHTML(sectionReference, sectionLabel, collapsed){
  var action = collapsed ? 'Show' : 'Hide';
  return '<button type="button" class="prosetoggle" aria-controls="section-' +
    esc(sectionReference) + '-prose" aria-expanded="' + (collapsed ? 'false' : 'true') +
    '" aria-label="' + action + ' prose for ' + esc(sectionLabel) + '" title="' +
    action + ' section prose"><svg class="prosechev" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M4 6l4 4 4-4"/></svg></button>';
}
function sectionIntroHTML(sec, gi, sectionReference){
  sec = sec || {};
  var hasProse = sectionHasProse(sec);
  var defaultCollapsed = sec.collapsed === true;
  var sectionLabel = sec.heading || ('section ' + (gi + 1));
  var srcChip = (sec.source && typeof sec.source === 'string') ?
    ' <a class="srcchip" href="' + esc(sec.source) + '" target="_blank" rel="noopener">source &#8599;</a>' : '';
  var embedChip = sec.diagram ?
    ' <button type="button" class="copychip embedcopy" title="Copy embed link (this diagram only, no page chrome)"' +
    ' aria-label="Copy embed link for ' + esc(sectionLabel) + ' — the diagram alone, without the page">' +
    EMBED_ICON + '</button>' : '';
  var toggle = hasProse ? proseToggleHTML(sectionReference, sectionLabel, defaultCollapsed) : '';
  var h = '';
  if (sec.heading){
    h += '<p class="sec-eyebrow">section ' + (gi + 1) + '</p>';
    h += '<div class="sec-heading-row"><h3 class="sec-h">' + esc(sec.heading) + srcChip + embedChip +
      '</h3>' + toggle + '</div>';
  } else {
    h += '<div class="sec-heading-row sec-heading-row-eyebrow"><p class="sec-eyebrow">section ' +
      (gi + 1) + srcChip + embedChip + '</p>' + toggle + '</div>';
  }
  if (hasProse){
    h += '<div class="sec-prose" id="section-' + esc(sectionReference) + '-prose"' +
      (defaultCollapsed ? ' hidden' : '') + '>';
    var texts = typeof sec.text === 'string' ? [sec.text] :
                (Array.isArray(sec.text) ? sec.text : []);
    texts.forEach(function(t, ti){ h += '<p class="sec-text" data-dv-para="' + ti + '">' + inlineMarkup(t) + '</p>'; });
    if (Array.isArray(sec.bullets) && sec.bullets.length) h += bulletsHTML(sec.bullets, true);
    h += '</div>';
    /* collapsed sections show one clamped line of the prose instead of
       nothing: the first paragraph, else the first bullet. The teaser is
       a mouse/touch convenience (click expands); the prosetoggle button
       stays the accessible control, so this row is aria-hidden. */
    var teaserSource = '';
    for (var tt = 0; tt < texts.length && !teaserSource; tt++){
      if (typeof texts[tt] === 'string' && texts[tt]) teaserSource = texts[tt];
    }
    if (!teaserSource && Array.isArray(sec.bullets)){
      for (var bb = 0; bb < sec.bullets.length && !teaserSource; bb++){
        var bl = sec.bullets[bb];
        if (typeof bl === 'string' && bl) teaserSource = bl;
        else if (bl && typeof bl.text === 'string' && bl.text) teaserSource = bl.text;
      }
    }
    h += '<div class="sec-teaser"' + (defaultCollapsed ? '' : ' hidden') +
      ' aria-hidden="true" title="Show section prose"><span class="teasertext">' +
      esc(teaserSource) + '</span><span class="teasermore">&#8230; (expand for more)</span></div>';
  }
  return {html:h, hasProse:hasProse, defaultCollapsed:defaultCollapsed,
          sectionLabel:sectionLabel};
}
function setProseCollapsed(control, collapsed, animate, win){
  if (!control || !control.proseEl || !control.toggleButton) return false;
  collapsed = !!collapsed;
  var changed = control.collapsed !== collapsed;
  control.collapsed = collapsed;
  control.toggleButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  control.toggleButton.setAttribute('aria-label', (collapsed ? 'Show' : 'Hide') +
    ' prose for ' + control.sectionLabel);
  control.toggleButton.setAttribute('title', (collapsed ? 'Show' : 'Hide') + ' section prose');

  control._animationGeneration = (control._animationGeneration || 0) + 1;
  var generation = control._animationGeneration;
  if (control.animation && typeof control.animation.cancel === 'function') control.animation.cancel();
  control.animation = null;
  if (control.proseEl.style) control.proseEl.style.overflow = '';
  var reduced = win && typeof win.matchMedia === 'function' &&
                win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduced || typeof control.proseEl.animate !== 'function'){
    control.proseEl.hidden = collapsed;
    if (control.teaserEl) control.teaserEl.hidden = !collapsed;
    return changed;
  }

  /* expanding: the teaser leaves immediately; collapsing: it appears when
     the shrink animation lands (onfinish below), so the two never stack */
  if (control.teaserEl && !collapsed) control.teaserEl.hidden = true;
  control.proseEl.hidden = false;
  var height = control.proseEl.scrollHeight || 0;
  if (control.proseEl.style) control.proseEl.style.overflow = 'hidden';
  var frames = collapsed ?
    [{height:height + 'px', opacity:1}, {height:'0px', opacity:0}] :
    [{height:'0px', opacity:0}, {height:height + 'px', opacity:1}];
  var animation = control.proseEl.animate(frames, {duration:180, easing:'ease-out'});
  control.animation = animation;
  animation.onfinish = function(){
    if (control._animationGeneration !== generation) return;
    control.proseEl.hidden = control.collapsed;
    if (control.teaserEl) control.teaserEl.hidden = !control.collapsed;
    if (control.proseEl.style) control.proseEl.style.overflow = '';
    control.animation = null;
  };
  return changed;
}
function createProseController(proseEl, toggleButton, defaultCollapsed, onChange, win, sectionLabel, teaserEl){
  if (!proseEl || !toggleButton) return null;
  var control = {proseEl:proseEl, toggleButton:toggleButton, teaserEl:teaserEl || null,
                 defaultCollapsed:!!defaultCollapsed, collapsed:!defaultCollapsed,
                 sectionLabel:sectionLabel || 'this section', animation:null};
  setProseCollapsed(control, control.defaultCollapsed, false, win);
  toggleButton.addEventListener('click', function(){
    if (setProseCollapsed(control, !control.collapsed, true, win) && onChange) onChange();
  });
  if (teaserEl && typeof teaserEl.addEventListener === 'function')
    teaserEl.addEventListener('click', function(){
      if (setProseCollapsed(control, false, true, win) && onChange) onChange();
    });
  return control;
}

/* CSS handles automatic sizing, including hidden tabs and editor resizes.
   Center a newly scrollable view so centered entry nodes start in sight.
   These controls are viewport state only; they never patch the diagram. */
function createBoardSizeControl(board, legend, label){
  var group = document.createElement('div'); group.className = 'board-size';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Diagram size');
  var caption = document.createElement('span'); caption.textContent = 'View'; group.appendChild(caption);
  var choices = [['auto', 'Auto', 'Readable on narrow diagrams; fit the available width on wider diagrams'],
    ['fit', 'Fit width', 'Show the whole diagram at the available width'],
    ['readable', 'Readable', 'Keep labels at their designed size; scroll sideways to explore']];
  var buttons = {}, mode = 'auto', wasScrollable = null, destroyed = false;
  var pan = document.createElement('div'); pan.className = 'board-pan'; pan.hidden = true;
  pan.setAttribute('role', 'group'); pan.setAttribute('aria-label', 'Horizontal diagram scroll');
  var panLabel = document.createElement('span'); panLabel.textContent = 'Scroll'; pan.appendChild(panLabel);
  function panButton(direction, text){
    var button = document.createElement('button'); button.className = 'mbtn board-pan-button'; button.type = 'button';
    button.textContent = text; button.title = 'Scroll diagram ' + (direction < 0 ? 'left' : 'right');
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', function(){ panTo(board.scrollLeft + direction * board.clientWidth * .75); });
    return button;
  }
  var left = panButton(-1, '←'), right = panButton(1, '→');
  var position = document.createElement('input'); position.type = 'range'; position.className = 'board-pan-position';
  position.min = '0'; position.max = '100'; position.step = '.1'; position.value = '0';
  position.setAttribute('aria-label', 'Horizontal diagram position'); position.title = 'Drag to scroll horizontally';
  pan.appendChild(left); pan.appendChild(position); pan.appendChild(right);
  function maxScroll(){ return Math.max(0, board.scrollWidth - board.clientWidth); }
  function syncPan(){
    if (destroyed) return;
    var max = maxScroll(), offset = Math.max(0, Math.min(max, board.scrollLeft));
    var percent = max > 1 ? offset / max * 100 : 0;
    position.value = String(percent);
    position.setAttribute('aria-valuetext', Math.round(percent) + '% from left');
    left.disabled = offset <= 1; right.disabled = offset >= max - 1;
  }
  function panTo(offset){
    if (destroyed || !Number.isFinite(offset)) return;
    board.scrollLeft = Math.max(0, Math.min(maxScroll(), offset)); syncPan();
  }
  position.addEventListener('input', function(){ panTo(Number(position.value) / 100 * maxScroll()); });
  board.addEventListener('scroll', syncPan, {passive:true});
  function syncOverflow(){
    if (destroyed || !board.clientWidth) return;
    var scrollable = board.scrollWidth > board.clientWidth + 1;
    if (scrollable && !wasScrollable) board.scrollLeft = (board.scrollWidth - board.clientWidth) / 2;
    board.classList.toggle('board-overflow', scrollable);
    pan.hidden = !scrollable; syncPan();
    wasScrollable = scrollable;
  }
  function setMode(value){
    if (destroyed || ['auto', 'fit', 'readable'].indexOf(value) < 0) return;
    mode = value;
    choices.forEach(function(choice){
      board.classList.toggle('board-size-' + choice[0], mode === choice[0]);
      buttons[choice[0]].setAttribute('aria-pressed', String(mode === choice[0]));
    });
    syncOverflow();
  }
  choices.forEach(function(choice){
    var button = document.createElement('button'); button.className = 'mbtn'; button.type = 'button';
    button.textContent = choice[1]; button.title = choice[2]; buttons[choice[0]] = button;
    button.addEventListener('click', function(){ setMode(choice[0]); }); group.appendChild(button);
  });
  group.appendChild(pan);
  legend.appendChild(group);
  board.tabIndex = 0; board.setAttribute('role', 'region');
  board.setAttribute('aria-label', (label || 'Flow') + ' diagram; scroll horizontally to explore');
  setMode('auto');
  var observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncOverflow) : null;
  if (observer) observer.observe(board);
  return {mode:function(){ return mode; }, setMode:setMode,
    destroy:function(){ destroyed = true; board.removeEventListener('scroll', syncPan); if (observer) observer.disconnect(); }};
}

function appendCanonLinks(host,links){
  links.forEach(function(link){var a=document.createElement('a');a.href=link.url;a.target='_blank';a.rel='noopener';a.textContent=link.label+' ↗';host.appendChild(a);});
}
function buildSection(container, sec, gi, sectionReference, protos, skin, lanes, backlinks, onChange, onProseChange, options){
  var accRaw = sec.accent;
  var acc = isHex(accRaw) ? accRaw : (ACCENTS[accRaw] || ACCENTS[ACCENT_CYCLE[gi % ACCENT_CYCLE.length]]);
  var box = document.createElement('section');
  box.className = 'doc-sec';
  box.id = 'section-' + sectionReference;
  box.setAttribute('data-dv-section', String(gi));
  box.style.setProperty('--acc', acc);
  var intro = sectionIntroHTML(sec, gi, sectionReference);
  var inner = intro.html;
  inner += contractCardHTML(sec.contract, sectionReference);
  box.innerHTML = inner;
  container.appendChild(box);
  var prose = intro.hasProse ? createProseController(
    box.querySelector('.sec-prose'), box.querySelector('.prosetoggle'),
    intro.defaultCollapsed, onProseChange,
    typeof window !== 'undefined' ? window : null, intro.sectionLabel,
    box.querySelector('.sec-teaser')) : null;
  var result = {sectionEl:box, stepper:null, boardSize:null,
                prose:prose,
                contractCard:box.querySelector('.ctcard'),
                contractRows:Array.prototype.slice.call(box.querySelectorAll('.ctrow'))};
  if (!sec.diagram) return result;

  if (typeof FlowCanon!=='undefined'){
    var catalogLinks=[];
    Object.keys(sec.diagram.nodes || {}).forEach(function(id){
      FlowCanon.links(sec.diagram.nodes[id]).forEach(function(link){catalogLinks.push({label:id+' · '+link.label,url:link.url});});
    });
    if(catalogLinks.length){
      var evidence=document.createElement('details');evidence.className='canon-evidence';
      var evidenceSummary=document.createElement('summary');evidenceSummary.textContent='Services, APIs and source code';evidence.appendChild(evidenceSummary);
      appendCanonLinks(evidence,catalogLinks);box.appendChild(evidence);
    }
  }

  var d = sec.diagram;
  if(d.referenceTrace || (Array.isArray(d.incidents) && d.incidents.length)){
    var traceDetails=document.createElement('details');traceDetails.className='canon-evidence';
    var traceSummary=document.createElement('summary');traceSummary.textContent='Trace evidence and comparison limits';traceDetails.appendChild(traceSummary);
    function traceNote(text){var p=document.createElement('p');p.textContent=text;traceDetails.appendChild(p);}
    if(d.referenceTrace && d.referenceTrace.trace){
      traceNote('Approved reference: '+d.referenceTrace.trace.traceId+' · '+(d.referenceTrace.approval && d.referenceTrace.approval.reason || ''));
      if(typeof FlowCanon!=='undefined' && FlowCanon.http(d.referenceTrace.trace.sourceUrl))appendCanonLinks(traceDetails,[{label:'Reference trace',url:FlowCanon.http(d.referenceTrace.trace.sourceUrl)}]);
    }
    (Array.isArray(d.incidents)?d.incidents:[]).forEach(function(incident){
      if(!incident || typeof incident!=='object')return;
      traceNote(incident.traceId+' · first difference: '+incident.firstDivergence);
      traceNote(incident.note || 'Trace evidence is observational; missing spans do not establish an outage.');
      (Array.isArray(incident.warnings)?incident.warnings:[]).forEach(traceNote);
      if(Array.isArray(incident.unmatched) && incident.unmatched.length)traceNote('Unmatched spans: '+incident.unmatched.map(function(s){return s.serviceName+' / '+s.operation;}).join(', '));
      if(typeof FlowCanon!=='undefined' && FlowCanon.http(incident.sourceUrl))appendCanonLinks(traceDetails,[{label:'Incident trace',url:FlowCanon.http(incident.sourceUrl)}]);
    });box.appendChild(traceDetails);
  }
  var activeDiagram = diagramForPath(d);
  var prefix = 'fs' + gi;
  var hasPanels = Array.isArray(d.panels) && d.panels.length > 0;

  var primaryPanel = diagramFocusPanel(d);
  var boardLayout = createBoardGrid(box, hasPanels, primaryPanel);
  result.flowDisclosure = boardLayout.flowDisclosure;
  var grid = boardLayout.grid;

  var boardDiv = document.createElement('div');
  boardDiv.className = 'board';
  var lg = document.createElement('div'); lg.className = 'lg';
  var bwrap = document.createElement('div');
  bwrap.className = 'boardcanvas';
  result.destroy=function(){if(panelCtl)panelCtl.destroy();destroyBoardLinks(bwrap);};
  boardDiv.appendChild(lg); boardDiv.appendChild(bwrap);
  boardLayout.diagramHost.appendChild(boardDiv);

  var panelCtl = null;
  if (hasPanels){
    var aside = document.createElement('div');
    aside.className = 'panelcol';
    grid.appendChild(aside);
    panelCtl = buildPanels(aside, activeDiagram, skin, boardLayout.primaryHost, primaryPanel && primaryPanel.id);
    if (primaryPanel && d.panels.length === 1) aside.hidden = true;
  }

  var board = renderBoard(bwrap, activeDiagram, prefix, skin, protos, backlinks, options);
  lg.innerHTML = legendHTML(board.kindsUsed, board.anyRet, skin, protos);
  result.boardSize = createBoardSizeControl(boardDiv, lg, d.title || sec.heading);

  var view = VIEW_SET.indexOf(d.view) >= 0 ? d.view : 'ambient';
  var hasSteps = (d.steps || []).length > 0;
  var hasDelta = diagramHasDelta(d);
  var btnDelta = null, bar = null;
  function addFocusControl(){
    var ready=false;
    function presentationChanged(host){
      if(result.stepper)result.stepper.scrollTargetEl=host;
      if(!ready)return;
      box.setAttribute('data-view-id',result.presentation.viewId());
      if(onChange)onChange();
    }
    if (primaryPanel) result.presentation = createDiagramFocusControl(boardLayout, primaryPanel, aside, bar,
      d.primaryPanel === primaryPanel.id ? 'panel' : 'flow', presentationChanged);
    var composition=createSectionComposition(box,boardLayout,d,boardDiv,bar,result.presentation,options && options.layoutTarget,presentationChanged,result.stepper);
    if(composition)result.presentation=composition;
    ready=true;
    box.setAttribute('data-view-id',result.presentation?result.presentation.viewId():'flow');
  }
  if (hasDelta){
    btnDelta = document.createElement('button');
    btnDelta.className = 'mbtn dbtn'; btnDelta.textContent = 'Δ ONLY';
    btnDelta.setAttribute('aria-pressed', 'false');
    btnDelta.addEventListener('click', function(){
      var on = btnDelta.getAttribute('aria-pressed') !== 'true';
      boardDiv.classList.toggle('dv-deltaonly', on);
      if (bar) bar.classList.toggle('dv-deltaonly', on);
      btnDelta.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  if (!hasSteps || view === 'ambient-only'){
    if (btnDelta){
      var deltaTog = document.createElement('span'); deltaTog.className = 'mtoggle';
      deltaTog.appendChild(btnDelta); (boardLayout.modesHost || lg).appendChild(deltaTog);
    }
    addFocusControl();
    return result;
  }

  /* mode toggle in the legend bar */
  var tog = document.createElement('span'); tog.className = 'mtoggle';
  var btnAmb = document.createElement('button'); btnAmb.className = 'mbtn'; btnAmb.textContent = 'AMBIENT';
  var btnStep = document.createElement('button'); btnStep.className = 'mbtn'; btnStep.textContent = 'STEP';
  btnAmb.setAttribute('aria-pressed', 'true'); btnStep.setAttribute('aria-pressed', 'false');
  tog.appendChild(btnAmb); tog.appendChild(btnStep); (boardLayout.modesHost || lg).appendChild(tog);
  if (btnDelta) tog.appendChild(btnDelta);

  /* termbar */
  bar = document.createElement('div');
  bar.className = 'termbar'; bar.hidden = true;
  var btnPrev = document.createElement('button'); btnPrev.className = 'tbtn'; btnPrev.innerHTML = '&#8249;'; btnPrev.setAttribute('aria-label', 'Previous step');
  var btnPlay = document.createElement('button'); btnPlay.className = 'tbtn playback-button';
  var btnNext = document.createElement('button'); btnNext.className = 'tbtn'; btnNext.innerHTML = '&#8250;'; btnNext.setAttribute('aria-label', 'Next step');
  var chips = document.createElement('div'); chips.className = 'schips';
  if (diagramPathList(d).length > 1) bar.classList.add('has-paths');
  var line = document.createElement('div'); line.className = 'stepline';
  var stepN = document.createElement('b'); var stepText = document.createElement('span');
  var failureStatus = document.createElement('span'); failureStatus.className = 'comm-status'; failureStatus.hidden = true;
  failureStatus.setAttribute('aria-label','Communication failures');
  var lanePill = document.createElement('span');
  lanePill.className = 'lanepill'; lanePill.hidden = true;
  var stepIdEl = document.createElement('span');
  stepIdEl.className = 'stepid'; stepIdEl.hidden = true;
  var srcA = document.createElement('a');
  srcA.className = 'steplink'; srcA.target = '_blank'; srcA.rel = 'noopener';
  srcA.textContent = 'source ↗'; srcA.hidden = true;
  var evidenceLinks=document.createElement('span');evidenceLinks.className='canon-step-links';evidenceLinks.hidden=true;
  var copyStep = document.createElement('button');
  copyStep.type = 'button'; copyStep.className = 'copychip stepcopy';
  copyStep.innerHTML = COPY_ICON; copyStep.title = 'Copy link';
  copyStep.setAttribute('aria-label', 'Copy link to this diagram step');
  line.appendChild(stepN); line.appendChild(lanePill); line.appendChild(stepText);
  line.appendChild(failureStatus);
  line.appendChild(stepIdEl); line.appendChild(srcA); line.appendChild(copyStep);
  line.appendChild(evidenceLinks);
  var runtimeStatus=document.createElement('span');runtimeStatus.className='runtime-status';runtimeStatus.hidden=true;runtimeStatus.setAttribute('aria-label','Runtime evidence');line.appendChild(runtimeStatus);
  var transport = document.createElement('div'); transport.className = 'step-transport';
  transport.setAttribute('role','group'); transport.setAttribute('aria-label','Step playback');
  transport.appendChild(btnPrev); transport.appendChild(btnPlay); transport.appendChild(btnNext);
  var playbackStatus = document.createElement('span'); playbackStatus.className = 'playback-status';
  playbackStatus.setAttribute('role','status'); playbackStatus.setAttribute('aria-live','polite');
  playbackStatus.title = 'Shows whether the steps advance automatically. Animations within the current step can continue while paused.';
  transport.appendChild(playbackStatus); bar.appendChild(transport);
  bar.appendChild(chips); bar.appendChild(line);
  boardLayout.controlsHost.appendChild(bar);

  /* print-only numbered caption list (C4) */
  var ol = document.createElement('ol');
  ol.className = 'printsteps';
  var printDiagram=activeDiagram,printFilter=null;
  function printSteps(diagram){
    printDiagram=diagram;
    ol.innerHTML = '';
    (diagram.steps || []).forEach(function(st){
      if(printFilter && printFilter.indexOf(st.id)<0)return;
      var li = document.createElement('li');
      li.textContent = (st && st.lane ? '[' + st.lane + '] ' : '') + ((st && st.text) || '') +
        (Object.keys(stepFailures(st)).length ? ' [' + communicationFailureText(diagram,stepFailures(st)) + ']' : '');
      ol.appendChild(li);
    });
  }
  printSteps(activeDiagram);
  box.appendChild(ol);

  var stepper = attachStepper(box, boardDiv, {
    bar:bar, chips:chips, stepN:stepN, stepText:stepText, failureStatus:failureStatus, srcA:srcA, lanePill:lanePill, stepIdEl:stepIdEl,evidenceLinks:evidenceLinks,runtimeStatus:runtimeStatus,
    btnPrev:btnPrev, btnPlay:btnPlay, btnNext:btnNext, btnAmb:btnAmb, btnStep:btnStep, playbackStatus:playbackStatus
  }, d, prefix, board, lanes, panelCtl, onChange, Object.assign({}, options, {viewSteps:function(ids){printFilter=ids;printSteps(printDiagram);},renderPath:function(next){
    printSteps(next);
    return renderBoard(bwrap, next, prefix, skin, protos, backlinks, options);
  }}));
  stepper.copyButton = copyStep;
  if (view === 'step') stepper.enterStep(true); /* host may disable automatic playback */
  result.stepper = stepper;
  addFocusControl();
  return result;
}

function renderPage(view, page, skin, backlinks, options){
  skin = resolveSkin('', skin == null ? page.skin : skin);
  var protos = resolveProtocols(page);
  var lanes = resolveLanes(page);
  backlinks = backlinks || Object.create(null);
  var renderSkin = skinBase(skin);
  view.className = 'docview ' + skinClasses(skin).join(' ');
  view.innerHTML = '';
  if (typeof FlowviewCompatibility !== 'undefined' && !(options && options.compatibilityNotice === false)){
    var compatibility = FlowviewCompatibility.check(page);
    if (compatibility.messages.length){
      var notice = document.createElement('aside');
      notice.className = 'flowview-compatibility'; notice.setAttribute('role','alert');
      notice.textContent = compatibility.messages.join(' ');
      view.appendChild(notice);
    }
  }
  if (page.title){
    var h = document.createElement('h2');
    h.className = 'doc-title'; h.textContent = page.title;
    view.appendChild(h);
  }
  var provenance = generatedFromHTML(page.generatedFrom);
  if (provenance) view.insertAdjacentHTML('beforeend', provenance);
  if (page.title){
    var su = document.createElement('p');
    su.className = 'doc-sub'; su.setAttribute('data-dv-skin-label', '');
    su.textContent = 'generated from spec · skin: ' + skin;
    view.appendChild(su);
  }
  var gi = 0;
  var pageBlocks = blocksOf(page);
  var records = sectionRecords(page);
  var deferredHides = [];
  var ctl = {view:view, tabBlock:null, tabBlocks:[], sections:[], steppers:[],
             onChange:null, activeTarget:{kind:'page'}, rendering:true};
  ctl.destroy = function(){
    ctl.destroyed = true;
    if(ctl.details)ctl.details.destroy();
    ctl.steppers.forEach(function(rec){ rec.stepper.destroy(); });
    ctl.sections.forEach(function(rec){
      if (rec.boardSize) rec.boardSize.destroy();
      if (rec.presentation) rec.presentation.destroy();
      if (rec.destroy) rec.destroy();
    });
    ctl.onChange = null;
  };
  function changed(target){
    if (ctl.rendering || ctl.destroyed) return;
    ctl.activeTarget = target;
    if (ctl.onChange) ctl.onChange();
  }
  function addSection(container){
    var record = records[gi], sec = record.section;
    var number = record.number, reference = record.reference;
    var built = buildSection(container, sec, gi++, reference, protos, renderSkin, lanes, backlinks,
      function(claimAddressBar){
        if (claimAddressBar !== false) changed({kind:'diagram', section:number});
        else if (ctl.activeTarget.kind === 'diagram' && ctl.activeTarget.section === number &&
                 ctl.onChange) ctl.onChange();
        else if (ctl.activeTarget.kind === 'tab'){
          var primary = ctl.sections.find(function(candidate){
            return candidate.stepper && candidate.tabBlock === ctl.activeTarget.tabBlock &&
                   candidate.tab === ctl.activeTarget.tab;
          });
          if (primary && primary.number === number) changed({kind:'diagram', section:number});
        }
      }, function(){ if (ctl.onChange) ctl.onChange(); }, options);
    var rec = {number:number, reference:reference, aliases:record.aliases, hasDiagram:!!sec.diagram, tabBlock:record.tabBlock, tab:record.tab,
               sectionEl:built.sectionEl, stepper:built.stepper, boardSize:built.boardSize, prose:built.prose,
               flowDisclosure:built.flowDisclosure, presentation:built.presentation,
               contractCard:built.contractCard, contractRows:built.contractRows, destroy:built.destroy};
    ctl.sections.push(rec);
    if (built.stepper) ctl.steppers.push(rec);
    return built;
  }
  pageBlocks.forEach(function(block, bi){
    if (block.type === 'section'){
      addSection(view);
      return;
    }
    /* tabs block */
    var tabBlockIndex = ctl.tabBlocks.length + 1;
    var bar = document.createElement('div');
    bar.className = 'tabbar';
    bar.setAttribute('role', 'tablist');
    view.appendChild(bar);
    var panels = [], buttons = [], copyButtons = [], slugs = [];
    var activeIdx = 0;
    block.tabs.forEach(function(t, ti){
      var unit = document.createElement('span');
      unit.className = 'tabunit'; unit.setAttribute('role', 'presentation');
      var btn = document.createElement('button');
      btn.className = 'tabbtn';
      /* optional per-tab highlight: true uses the default accent; a hex or a
         named accent token sets a custom highlight color via --hl. */
      if (t.highlight){
        btn.classList.add('hl');
        var hlc = isHex(t.highlight) ? t.highlight : ACCENTS[t.highlight];
        if (hlc) btn.style.setProperty('--hl', hlc);
      }
      btn.textContent = t.label;
      btn.setAttribute('role', 'tab');
      btn.id = 'tab-' + bi + '-' + ti;
      var copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'copychip tabcopy';
      copy.innerHTML = COPY_ICON; copy.title = 'Copy link';
      copy.setAttribute('aria-label', 'Copy link to tab ' + t.label);
      unit.appendChild(btn); unit.appendChild(copy); bar.appendChild(unit);
      var panel = document.createElement('div');
      panel.className = 'tabpanel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', btn.id);
      panel._steppers = [];
      view.appendChild(panel);
      t.sections.forEach(function(sec){
        var built = addSection(panel);
        if (built.stepper) panel._steppers.push(built.stepper);
      });
      panels.push(panel); buttons.push(btn); copyButtons.push(copy); slugs.push(slugify(t.label));
    });
    var tabCtl = null;
    function select(idx, focus, activate){
      if(ctl.details)ctl.details.pause();
      activeIdx = idx;
      buttons.forEach(function(b, i){
        b.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        b.setAttribute('tabindex', i === idx ? '0' : '-1');
      });
      panels.forEach(function(p, i){
        var wasHidden = p.hidden;
        p.hidden = i !== idx;
        p._steppers.forEach(function(s){ i === idx ? (wasHidden && s.onShow()) : s.onHide(); });
      });
      if (focus) buttons[idx].focus();
      if (activate !== false) changed({kind:'tab', tabBlock:tabBlockIndex, tab:idx});
    }
    buttons.forEach(function(b, i){
      b.addEventListener('click', function(){ select(i, false); });
    });
    bar.addEventListener('keydown', function(ev){
      if (buttons.indexOf(ev.target) < 0) return;
      var cur = buttons.findIndex(function(b){ return b.getAttribute('aria-selected') === 'true'; });
      if (ev.key === 'ArrowRight'){ select((cur + 1) % buttons.length, true); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft'){ select((cur - 1 + buttons.length) % buttons.length, true); ev.preventDefault(); }
      else if (ev.key === 'Home'){ select(0, true); ev.preventDefault(); }
      else if (ev.key === 'End'){ select(buttons.length - 1, true); ev.preventDefault(); }
    });
    tabCtl = {index:tabBlockIndex, bar:bar, buttons:buttons, copyButtons:copyButtons,
              slugs:slugs, select:select, count:buttons.length,
              active:function(){ return activeIdx; }};
    ctl.tabBlocks.push(tabCtl);
    if (!ctl.tabBlock) ctl.tabBlock = tabCtl; /* compatibility for presenter integrations */
    /* defer hiding so all boards are measured while displayed */
    deferredHides.push(function(){ select(0, false, false); });
  });
  deferredHides.forEach(function(f){ f(); });
  ctl.rendering = false;
  ctl.manifest = {
    tabBlocks:ctl.tabBlocks.map(function(tb){
      return {index:tb.index, count:tb.count, slugs:tb.slugs.slice()};
    }),
    sections:ctl.sections.map(function(sec){
      return {number:sec.number, reference:sec.reference, aliases:sec.aliases, hasDiagram:sec.hasDiagram, tabBlock:sec.tabBlock, tab:sec.tab,
              stepIds:sec.stepper ? sec.stepper.ids() : null,
              hasCard:!!sec.contractCard, rowCount:sec.contractRows.length};
    })
  };
  if (ctl.tabBlocks.length){
    ctl.activeTarget = {kind:'tab', tabBlock:1, tab:ctl.tabBlocks[0].active()};
    var initial = ctl.sections.find(function(sec){
      return sec.tabBlock === 1 && sec.tab === ctl.tabBlocks[0].active() && sec.stepper;
    });
    if (initial && initial.stepper.mode() === 'step')
      ctl.activeTarget = {kind:'diagram', section:initial.number};
  } else {
    var initialDirect = ctl.sections.find(function(sec){ return sec.stepper; });
    if (initialDirect && initialDirect.stepper.mode() === 'step')
      ctl.activeTarget = {kind:'diagram', section:initialDirect.number};
  }
  if(records.some(function(r){return r.section.detailOnly || Object.values(r.section.diagram && r.section.diagram.nodes || {}).some(function(n){return n.detail;});}))
    ctl.details=wireDetailFlows(ctl,page,skin,backlinks,options);
  return ctl;
}

/* A re-render (workbench Render click, skin switch) rebuilds the DOM and so
   resets every tabs block to its first tab. These helpers carry the reader's
   place across renderPage calls: capture the active tab's label slug plus
   its position per tabs block, then re-select that label in the new render.
   Tab identity is the LABEL — the position only disambiguates duplicate
   labels — so a label that no longer exists keeps the render default
   (first tab), never a positional stand-in. Blocks are matched by
   position. */
function activeTabReferences(ctl){
  if (!ctl || !ctl.tabBlocks || !ctl.tabBlocks.length) return null;
  return ctl.tabBlocks.map(function(tb){
    var idx = tb.active();
    return {slug: tb.slugs[idx], index: idx};
  });
}
function restoreActiveTabs(ctl, saved){
  if (!ctl || !ctl.tabBlocks || !saved) return;
  ctl.tabBlocks.forEach(function(tb, i){
    var rec = i < saved.length ? saved[i] : null;
    if (!rec || rec.slug == null) return;
    var idx = tb.slugs[rec.index] === rec.slug ? rec.index : tb.slugs.indexOf(rec.slug);
    if (idx > 0) tb.select(idx, false);
  });
}

/* ---------------- URL embed mode ----------------
   #embed=<section-ref>[&sk=<skin>] on a published page shows ONLY that
   section's diagram + panels + step controls — for hosting a single
   diagram in an iframe (Confluence). The ref is a unique heading slug
   or the 1-based rendered section number, same vocabulary as the d=
   deep-link selector. Parsing is pure (tested); boot.flowview.js
   applies it. Unknown hash keys are ignored by parseHash, so embed
   composes with the existing deep-link fields (m=, s=, d=, ...). */
function embedRequestFromHash(hashText){
  var out = null, skin = null;
  String(hashText || '').replace(/^#/, '').split('&').forEach(function(part){
    var i = part.indexOf('=');
    if (i <= 0) return;
    var k = part.slice(0, i), v;
    try { v = decodeURIComponent(part.slice(i + 1)); }
    catch (ex){ return; }
    if (k === 'embed' && v) out = v;
    else if (k === 'sk' && v) skin = v;
  });
  return out ? {section: out, skin: skin} : null;
}
function embedTargetSection(ctl, ref){
  var target = null;
  ((ctl && ctl.sections) || []).forEach(function(rec){
    if (!target && (rec.reference === ref || String(rec.number) === ref)) target = rec;
  });
  return target;
}

/* ---------------- deep links: hash <-> complete viewer state -------------
   Legacy: numeric d/c section selectors and #t=<tab>&m/s for the first
   stepper in that tab. Canonical d/c selectors use unique heading slugs (or
   the rendered index for a heading-less section). Tab, diagram state, and a
   contract card/row are independent fields and may be restored together.
   x/e carry only prose-collapse deviations from each authored default. */
function removeManualCopyField(button){
  var field = button && button._dvCopyField;
  if (field && field.parentNode) field.parentNode.removeChild(field);
  if (button) button._dvCopyField = null;
}
function showManualCopyField(win, button, text){
  removeManualCopyField(button);
  var field = win.document.createElement('input');
  field.type = 'text';
  field.className = 'copyfallback';
  field.value = text;
  field.readOnly = true;
  field.setAttribute('aria-label', 'Copy this link manually');
  field.setAttribute('title', 'Automatic copying was denied; copy this selected URL manually.');
  if (button && button.parentNode){
    button.parentNode.insertBefore(field, button.nextSibling);
    button._dvCopyField = field;
  } else win.document.body.appendChild(field);
  field.focus();
  field.select();
  return field;
}
function fallbackCopy(win, text, button){
  var area = win.document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed'; area.style.left = '-9999px'; area.style.top = '0';
  win.document.body.appendChild(area); area.focus(); area.select();
  var copied = false;
  try { copied = win.document.execCommand('copy') === true; } catch (ex) { copied = false; }
  if (area.parentNode) area.parentNode.removeChild(area);
  if (!copied) showManualCopyField(win, button, text);
  return copied;
}
/* Click handler for one copy-link icon button. Module-level (not a
   wireDeepLinks closure) so node tests can drive clicks with a fake window.
   urlFn is called at click time so the copied URL reflects current state. */
function bindCopyControl(win, button, urlFn){
  if (!button) return;
  /* restore the button's OWN glyph after feedback — chips carry
     different icons (link, embed frame) */
  var restIcon = button.innerHTML;
  button.addEventListener('click', function(){
    var text = urlFn();
    removeManualCopyField(button);
    /* a slow clipboard promise from an earlier click must not overwrite
       the feedback of a later one */
    var gen = (button._dvCopyGen || 0) + 1;
    button._dvCopyGen = gen;
    function announce(message){
      /* the glyphs are aria-hidden, so feedback also goes to a visually
         hidden role=status region beside the button */
      var region = button._dvStatus;
      if (!region || !region.parentNode){
        if (!win.document || !win.document.createElement || !button.parentNode) return;
        region = win.document.createElement('span');
        region.className = 'copystatus';
        region.setAttribute('role', 'status');
        button.parentNode.insertBefore(region, button.nextSibling);
        button._dvStatus = region;
      }
      region.textContent = message;
    }
    function show(icon, cls, ms, message){
      button.innerHTML = icon;
      button.classList.remove('ok', 'err');
      if (cls) button.classList.add(cls);
      announce(message || '');
      if (button._dvFeedback) win.clearTimeout(button._dvFeedback);
      button._dvFeedback = ms ?
        win.setTimeout(function(){ show(restIcon, null, 0); }, ms) : null;
    }
    function done(){ if (button._dvCopyGen === gen) show(COPY_OK_ICON, 'ok', 1200, 'Link copied'); }
    function failed(){ if (button._dvCopyGen === gen) show(COPY_FAIL_ICON, 'err', 2400, 'Copy failed'); }
    function tryFallback(){
      if (button._dvCopyGen !== gen) return;
      fallbackCopy(win, text, button) ? done() : failed();
    }
    try {
      if (win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText){
        win.navigator.clipboard.writeText(text).then(done, tryFallback);
      } else tryFallback();
    } catch (ex) { tryFallback(); }
  });
}

function wireDeepLinks(ctl, win, preservedHash){
  /* preservedHash (optional): raw "k=v&k=v" text kept at the FRONT of
     every hash this channel writes and of every copied link — the embed
     mode passes "embed=<ref>[&sk=<skin>]" so reloads and links keep the
     embedded view. parseHash ignores the keys, so state handling is
     unaffected. */
  var suppress = false;
  var linkBase = null;
  var linkBasePath = null;
  var mirrorSource = null;
  var mirrorOrigin = null;
  var fragmentState = {tabBlock:null, tab:null, diagramSection:null,
                       cardSection:null, row:null};
  function receiveLinkBaseMessage(event){
    if (!event || !event.data || event.data.type !== 'dv_linkbase') return false;
    /* Only the actual iframe parent may open this channel. The first accepted
       message pins both its WindowProxy and origin; navigation updates from
       that pair are allowed, while every other sender/origin is ignored. */
    if (event.source !== win.parent) return false;
    if (linkBasePath === 'direct') return false;
    if (linkBasePath === 'message' &&
        (event.source !== mirrorSource || event.origin !== mirrorOrigin)) return false;
    if (typeof event.origin !== 'string' || !event.origin || event.origin === '*')
      return false;
    var canonical = canonicalLinkBase(event.data.base);
    if (canonical === null) return false;
    if (linkBasePath === null){
      linkBasePath = 'message';
      mirrorSource = event.source;
      mirrorOrigin = event.origin;
    }
    linkBase = canonical;
    return true;
  }
  win.dvSetLinkBase = function(base){
    var canonical = canonicalLinkBase(base);
    if (canonical === null) return false;
    /* Direct calls are same-origin privileged and take precedence: they may
       replace a message registration, then lock out all later messages.
       Repeated direct calls may still update the base. */
    linkBasePath = 'direct';
    linkBase = canonical;
    mirrorSource = win.parent;
    mirrorOrigin = win.location.origin;
    return true;
  };
  function section(number){
    for (var i = 0; i < ctl.sections.length; i++)
      if (ctl.sections[i].number === number) return ctl.sections[i];
    return null;
  }
  function sectionByReference(ref){
    if (ref == null) return null;
    var key = String(ref), i;
    for (i = 0; i < ctl.sections.length; i++)
      if (String(ctl.sections[i].reference) === key) return ctl.sections[i];
    for(i=0;i<ctl.sections.length;i++)if(ctl.sections[i].aliases && ctl.sections[i].aliases.indexOf(key)>=0)return ctl.sections[i];
    var index = oneBasedIndex(key, ctl.sections.length);
    if (index < 0) return null;
    return section(index + 1);
  }
  function listedSectionRefs(value){
    if (value == null) return [];
    return String(value).split(',').filter(function(ref){ return ref.length > 0; });
  }
  function tabBlock(number){
    for (var i = 0; i < ctl.tabBlocks.length; i++)
      if (ctl.tabBlocks[i].index === number) return ctl.tabBlocks[i];
    return null;
  }
  function selectRoute(target){
    if (target.tabBlock != null){
      var tb = tabBlock(target.tabBlock);
      if (tb && target.tab != null) tb.select(target.tab, false, false);
    }
  }
  function activeStepper(){
    if(ctl.details && ctl.details.activeStepper())return ctl.details.activeStepper();
    var active = fragmentState.diagramSection != null ? section(fragmentState.diagramSection) :
                 (ctl.activeTarget && ctl.activeTarget.section ? section(ctl.activeTarget.section) : null);
    if (active && active.stepper) return active.stepper;
    if (!ctl.tabBlocks.length) return ctl.steppers.length ? ctl.steppers[0].stepper : null;
    var tb = ctl.activeTarget && ctl.activeTarget.tabBlock ? tabBlock(ctl.activeTarget.tabBlock) : ctl.tabBlocks[0];
    var at = tb.active();
    for (var i = 0; i < ctl.steppers.length; i++)
      if (ctl.steppers[i].tabBlock === tb.index && ctl.steppers[i].tab === at)
        return ctl.steppers[i].stepper;
    return null;
  }
  function addCollapseDeviations(st){
    var collapsed = [], expanded = [];
    ctl.sections.forEach(function(sec){
      var prose = sec.prose;
      if (!prose || prose.collapsed === prose.defaultCollapsed) return;
      (prose.collapsed ? collapsed : expanded).push(String(sec.reference));
    });
    if (collapsed.length) st.x = collapsed.join(',');
    if (expanded.length) st.e = expanded.join(',');
    return st;
  }
  function applyCollapseState(st){
    ctl.sections.forEach(function(sec){
      if (sec.prose) setProseCollapsed(sec.prose, sec.prose.defaultCollapsed, false, win);
    });
    /* Expansion is applied last so a contradictory hand-written fragment has
       a deterministic result. Emitted fragments never contain both states. */
    listedSectionRefs(st.x).forEach(function(ref){
      var sec = sectionByReference(ref);
      if (sec && sec.prose) setProseCollapsed(sec.prose, true, false, win);
    });
    listedSectionRefs(st.e).forEach(function(ref){
      var sec = sectionByReference(ref);
      if (sec && sec.prose) setProseCollapsed(sec.prose, false, false, win);
    });
  }
  function tabHash(tb, index){
    return buildHash(addCollapseDeviations({b:tb.index > 1 ? String(tb.index) : null,
                                            t:tabReference(tb.slugs, index)}));
  }
  function cloneState(state){
    return {tabBlock:state.tabBlock, tab:state.tab,
            diagramSection:state.diagramSection,
            cardSection:state.cardSection, row:state.row};
  }
  function stateHash(state){
    var st = {};
    if (state.tabBlock != null && state.tab != null){
      var tb = tabBlock(state.tabBlock);
      if (tb){
        st.b = tb.index > 1 ? String(tb.index) : null;
        st.t = tabReference(tb.slugs, state.tab);
      }
    }
    if (state.diagramSection != null){
      var diagramSec = section(state.diagramSection);
      if(diagramSec)st.d=String(diagramSec.reference);
      if(diagramSec && diagramSec.presentation && diagramSec.presentation.viewId)st.v=diagramSec.presentation.viewId();
      if (diagramSec && diagramSec.stepper){
        st.m = diagramSec.stepper.mode();
        if (diagramSec.stepper.paths && diagramSec.stepper.paths().length > 1) st.p = diagramSec.stepper.path();
        if (st.m === 'step'){
          var cur = diagramSec.stepper.current();
          st.s = stepReference(diagramSec.stepper.ids(), cur.n);
        }
      }
    }
    if (state.cardSection != null){
      var cardSec = section(state.cardSection);
      if (cardSec && cardSec.contractCard){
        st.c = String(cardSec.reference);
        if (state.row != null) st.r = String(state.row + 1);
      }
    }
    if(ctl.details && ctl.details.snapshot())st.q=JSON.stringify(ctl.details.snapshot());
    return buildHash(addCollapseDeviations(st));
  }
  function currentHash(){ return stateHash(fragmentState); }
  function syncChangedTarget(){
    var target = ctl.activeTarget || {kind:'page'};
    if (target.kind === 'diagram'){
      fragmentState.diagramSection = target.section;
    } else if (target.kind === 'tab'){
      fragmentState = {tabBlock:target.tabBlock, tab:target.tab,
                       diagramSection:null, cardSection:null, row:null};
    }
  }
  function withPreserved(h){
    if (!preservedHash) return h;
    var rest = String(h || '').replace(/^#/, '');
    return '#' + preservedHash + (rest ? '&' + rest : '');
  }
  function write(){
    if (suppress) return;
    syncChangedTarget();
    if (fragmentState.row == null) clearRowTarget();
    var h = currentHash();
    try {
      win.history[ctl.detailHistoryPush ? 'pushState' : 'replaceState'](null, '',
        withPreserved(h) || win.location.pathname + win.location.search);
      /* Fragments may contain heading slugs derived from a company document.
         Do not disclose them to an arbitrary embedder: mirroring stays off
         until a valid link-base handshake identifies the host, then targets
         only that origin. A same-origin dvSetLinkBase call is trusted by the
         browser's same-origin policy and uses this page's own origin. */
      if (mirrorSource && typeof mirrorSource.postMessage === 'function')
        mirrorSource.postMessage({type:'dv_fragment', fragment:h.replace(/^#/, '')}, mirrorOrigin);
    } catch (ex) { /* sandboxed viewers may refuse; deep links just stay off */ }
    ctl.detailHistoryPush=false;
  }
  function clearRowTarget(){
    var rows = ctl.view.querySelectorAll('.ctrow.dv-hash-target');
    for (var i = 0; i < rows.length; i++){
      rows[i].classList.remove('dv-hash-target');
      if (win.document.activeElement === rows[i] && typeof rows[i].blur === 'function') rows[i].blur();
    }
  }
  function apply(){
    var st = parseHash(win.location.hash);
    var target = resolveHashTarget(st, ctl.manifest);
    suppress = true;
    if(ctl.details)ctl.details.close(true);
    clearRowTarget();
    /* Collapse affects document height, so restore it before routing and,
       critically, before the resolved target is scrolled into view. */
    applyCollapseState(st);
    selectRoute(target);
    var targetEl = null;
    var diagramTarget = target.diagram;
    if (diagramTarget){
      var diagramSec = section(diagramTarget.section), sp = diagramSec && diagramSec.stepper;
      if(ctl.details && diagramSec)ctl.details.showSection(diagramSec.reference);
      // Restore the view before its path/step: selecting a view installs its
      // visible-stop filter. Stale IDs (and old links without v) use the default.
      var presentation=diagramSec && diagramSec.presentation;
      if(presentation && presentation.setView){
        if(st.v == null || !presentation.setView(st.v))presentation.setView(presentation.defaultView());
      }
      if (sp && sp.selectPath) sp.selectPath(st.p || sp.paths()[0].id);
      if (sp && diagramTarget.mode === 'step'){
        sp.enterStep(false);
        var pathStep = sp.stepIndexOf(st.s);
        if (pathStep >= 0) sp.jump(pathStep);
      } else if (sp && diagramTarget.mode === 'ambient') sp.enterAmbient();
      targetEl = sp ? (sp.scrollTargetEl || sp.sectionEl) : diagramSec && diagramSec.sectionEl;
    }
    var cardTarget = target.card;
    if (cardTarget){
      var cardSec = section(cardTarget.section);
      targetEl = cardSec && cardSec.contractCard;
      if (cardTarget.kind === 'row' && cardSec && cardSec.contractRows[cardTarget.row]){
        var row = cardSec.contractRows[cardTarget.row];
        row.classList.add('dv-hash-target');
        targetEl = row;
        if (typeof row.focus === 'function'){
          try { row.focus({preventScroll:true}); } catch (ex) { row.focus(); }
        }
      }
    } else if (!diagramTarget && target.kind === 'tab'){
      var targetTabs = tabBlock(target.tabBlock);
      targetEl = targetTabs && targetTabs.buttons[target.tab];
    }
    fragmentState = {
      tabBlock:target.explicitTab ? target.explicitTab.tabBlock : null,
      tab:target.explicitTab ? target.explicitTab.tab : null,
      diagramSection:diagramTarget ? diagramTarget.section : null,
      cardSection:cardTarget ? cardTarget.section : null,
      row:cardTarget && cardTarget.kind === 'row' ? cardTarget.row : null
    };
    if (cardTarget)
      ctl.activeTarget = {kind:cardTarget.kind, section:cardTarget.section, row:cardTarget.row};
    else if (diagramTarget)
      ctl.activeTarget = {kind:'diagram', section:diagramTarget.section};
    else if (target.kind === 'tab')
      ctl.activeTarget = {kind:'tab', tabBlock:target.tabBlock, tab:target.tab};
    else ctl.activeTarget = {kind:'page'};
    if(ctl.details && st.q){try{ctl.details.restore(JSON.parse(st.q));}catch(_) {/* stale drill target leaves its valid ancestor visible */}}
    ctl.detailHistoryPush=false;
    if (targetEl && typeof targetEl.scrollIntoView === 'function'){
      targetEl.scrollIntoView({block: 'start', behavior: 'instant'});
    }
    suppress = false;
    write();
  }
  function fullURL(hash){
    if (linkBase !== null) return composeLinkURL(linkBase, hash);
    var href = String(win.location.href || '');
    var base = href ? href.split('#')[0] : (win.location.pathname + win.location.search);
    return base + withPreserved(hash);
  }
  function bindCopy(button, hashFn){
    bindCopyControl(win, button, function(){ return fullURL(hashFn()); });
  }
  /* embed-link chips copy the page's OWN address (search kept for the
     ?spec= mode, hash replaced) — NOT the registered host link base:
     the #embed fragment only works on the raw page an iframe points
     at, never on a wrapping host page. */
  ctl.sections.forEach(function(sec){
    var embedBtn = sec.sectionEl && sec.sectionEl.querySelector ?
      sec.sectionEl.querySelector('.embedcopy') : null;
    if (embedBtn) bindCopyControl(win, embedBtn, function(){
      var view=sec.presentation && sec.presentation.viewId && sec.presentation.viewId();
      return win.location.href.split('#')[0] + '#embed=' + encodeURIComponent(String(sec.reference))+
        (view?'&v='+encodeURIComponent(view):'');
    });
  });
  var initial = ctl.activeTarget || {kind:'page'};
  if (initial.kind === 'diagram') fragmentState.diagramSection = initial.section;
  else if (initial.kind === 'tab'){
    fragmentState.tabBlock = initial.tabBlock;
    fragmentState.tab = initial.tab;
  }
  ctl.sections.forEach(function(sec){
    if (sec.stepper) bindCopy(sec.stepper.copyButton, function(){
      var state = cloneState(fragmentState);
      state.diagramSection = sec.number;
      return stateHash(state);
    });
    if (sec.contractCard) bindCopy(sec.contractCard.querySelector('.contractcopy'),
      function(){
        var state = cloneState(fragmentState);
        state.cardSection = sec.number;
        state.row = null;
        return stateHash(state);
      });
  });
  ctl.tabBlocks.forEach(function(tb){
    tb.copyButtons.forEach(function(button, i){
      bindCopy(button, function(){ return tabHash(tb, i); });
    });
  });
  ctl.bindDetailCopy=function(button){bindCopy(button,currentHash);};
  ctl.onChange = write;
  ctl.activeStepper = activeStepper;
  win.addEventListener('hashchange', apply);
  if (win.location.hash) apply(); else write();
  return {receiveLinkBaseMessage:receiveLinkBaseMessage};
}

/* ---------------- presenter mode (C1): fullscreen + keyboard ---------------- */
function wirePresenter(ctl, view, win){
  var doc = win.document;
  var btn = doc.createElement('button');
  btn.className = 'tbtn presentbtn';
  btn.textContent = 'PRESENT';
  btn.setAttribute('aria-label', 'Enter presenter mode (fullscreen)');
  view.insertBefore(btn, view.firstChild);
  function presenting(){ return doc.body.classList.contains('presenting'); }
  function enter(){
    doc.body.classList.add('presenting');
    btn.textContent = 'EXIT';
    var root = doc.documentElement;
    if (root.requestFullscreen) root.requestFullscreen().catch(function(){});
  }
  function exit(){
    doc.body.classList.remove('presenting');
    btn.textContent = 'PRESENT';
    if (doc.fullscreenElement && doc.exitFullscreen) doc.exitFullscreen().catch(function(){});
  }
  btn.addEventListener('click', function(){ presenting() ? exit() : enter(); });
  doc.addEventListener('fullscreenchange', function(){
    if (!doc.fullscreenElement && presenting()){
      doc.body.classList.remove('presenting');
      btn.textContent = 'PRESENT';
    }
  });
  doc.addEventListener('keydown', function(ev){
    if (!presenting()) return;
    var sp = ctl.activeStepper ? ctl.activeStepper() : null;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft'){
      if (!sp) return;
      if (sp.mode() !== 'step') sp.enterStep(false);
      sp.advance(sp.current().n + (ev.key === 'ArrowRight' ? 1 : -1));
      ev.preventDefault();
    } else if (ev.key === ' '){
      if (!sp) return;
      if (sp.mode() !== 'step') sp.enterStep(false);
      sp.toggleAuto();
      ev.preventDefault();
    } else if (/^[1-9]$/.test(ev.key) && ctl.tabBlock){
      var ti = parseInt(ev.key, 10) - 1;
      if (ti < ctl.tabBlock.count){ ctl.tabBlock.select(ti, false); ev.preventDefault(); }
    } else if (ev.key === 'Escape'){
      exit();
    }
  });
}
