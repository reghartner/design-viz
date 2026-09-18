/* engine.js — layout, geometry, board/panel renderers, stepper, page renderer.
   Browser-pure fragment concatenated after validator.js by tools/build.py.
   layout/isWrap/edgePath are pure (Node-testable); the render functions need a
   DOM and are only called from the boot files. */

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
  return SKIN_NAMES.indexOf(specSkin) >= 0 ? specSkin : 'aurora';
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
  if (!host || !svg || !backlinks) return;
  var triggers = svg.querySelectorAll('.nbackref');
  if (!triggers.length) return;
  var pop = document.createElement('div');
  pop.className = 'nbackpop';
  pop.id = prefix + '-backlinks';
  pop.setAttribute('role', 'dialog');
  pop.hidden = true;
  host.appendChild(pop);
  var active = null, pinned = false, closeTimer = null, suppressFocusOpen = null;

  function cancelClose(){
    if (closeTimer){ clearTimeout(closeTimer); closeTimer = null; }
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
      trigger.addEventListener('mouseenter', function(){ show(trigger, false); });
      trigger.addEventListener('mouseleave', scheduleClose);
      trigger.addEventListener('focus', function(){
        if (suppressFocusOpen === trigger) return;
        show(trigger, false);
      });
      trigger.addEventListener('focusout', closeOnFocusOutside);
      trigger.addEventListener('click', function(ev){
        ev.stopPropagation();
        if (active === trigger && pinned) close();
        else show(trigger, true);
      });
      trigger.addEventListener('keydown', function(ev){
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
  pop.addEventListener('mouseenter', cancelClose);
  pop.addEventListener('mouseleave', scheduleClose);
  pop.addEventListener('focusin', cancelClose);
  pop.addEventListener('focusout', closeOnFocusOutside);
  pop.addEventListener('keydown', function(ev){
    if (ev.key === 'Escape'){
      ev.preventDefault();
      close(true);
    }
  });
  document.addEventListener('click', function(ev){
    if (!pop.hidden && !containsTarget(ev.target)) close();
  });
  var scrollHost = host.parentNode;
  if (scrollHost && scrollHost.addEventListener) scrollHost.addEventListener('scroll', close);
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
  pop.setAttribute('role','dialog');pop.setAttribute('popover','auto');pop.hidden=true;host.appendChild(pop);
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
    var target=ev.target===document?(document.scrollingElement || document.documentElement):ev.target;
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
    for(var ancestor=trigger;ancestor;ancestor=ancestor.parentElement)scrollAtOpen.push({el:ancestor,x:ancestor.scrollLeft,y:ancestor.scrollTop});
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

/* ---------------- layout + geometry (per diagram) ---------------- */
function layout(spec){
  var pos = {}, rowsMeta = [];
  var lanes = spec.routing === 'lanes' && laneRoutingSupported(spec);
  var laneCounts = {};
  if (lanes) laneEndpoints(spec).forEach(function(p){ laneCounts[p.gap] = (laneCounts[p.gap] || 0) + 1; });
  var floats = spec.floats || [];
  var hasAbove = floats.some(function(f){ return f && f.side !== 'below'; });
  var hasGroups = false;
  Object.keys(spec.nodes || {}).forEach(function(id){
    if (spec.nodes[id] && spec.nodes[id].group) hasGroups = true;
  });
  var parents = sanitizedGroupParents(spec.groups), levels = Object.create(null);
  function groupLevel(key){
    if (levels[key] !== undefined) return levels[key];
    var level = 0, cursor = key;
    while (parents[cursor] !== undefined){ level++; cursor = parents[cursor]; }
    levels[key] = level;
    return level;
  }
  var placed = Object.create(null), maxDepth = 1;
  spec.rows.forEach(function(row){
    row.forEach(function(slot){
      (Array.isArray(slot) ? slot : [slot]).forEach(function(id){ placed[id] = true; });
    });
  });
  floats.forEach(function(f){ if (f) placed[f.id] = true; });
  Object.keys(spec.nodes || {}).forEach(function(id){
    var g = spec.nodes[id] && spec.nodes[id].group;
    if (g && placed[id]) maxDepth = Math.max(maxDepth, groupLevel(g) + 1);
  });
  var top = hasAbove ? 125 : 42;
  if (lanes) top = Math.max(top, 40 + (laneCounts[-1] || 0) * 8);
  if (hasGroups) top += 26 + 34 * (maxDepth - 1); /* one title band per ancestor */

  spec.rows.forEach(function(slots, r){
    var maxStack = 1;
    slots.forEach(function(s){ if (Array.isArray(s)) maxStack = Math.max(maxStack, s.length); });
    var rowH = maxStack * CARD_H + (maxStack - 1) * STACK_GAP;
    var center = top + rowH / 2;
    var k = slots.length;
    var xs = [];
    for (var i = 0; i < k; i++){
      xs.push(k === 1 ? (LEFT_X + RIGHT_X) / 2 : LEFT_X + i * (RIGHT_X - LEFT_X) / (k - 1));
    }
    if (r % 2 === 1) xs.reverse(); /* serpentine */

    slots.forEach(function(s, i){
      if (Array.isArray(s)){
        var m = s.length;
        var totalH = m * CARD_H + (m - 1) * STACK_GAP;
        s.forEach(function(id, j){
          pos[id] = {cx: xs[i], cy: center - totalH/2 + CARD_H/2 + j*(CARD_H+STACK_GAP),
                     w:170, h:CARD_H, row:r, flow:i, stack:true};
        });
      } else {
        pos[s] = {cx: xs[i], cy: center, w:150, h:CARD_H, row:r, flow:i, stack:false};
      }
    });
    rowsMeta.push({top:top, center:center, height:rowH, slots:slots, k:k});
    top += rowH + (lanes ? Math.max(ROW_GAP, 40 + (laneCounts[r] || 0) * 8) : ROW_GAP);
  });

  /* floats: anchor each at the mean x of its connected nodes, then spread the
     floats sharing a side so they cannot overlap (B3) */
  var lastRow = rowsMeta[rowsMeta.length - 1];
  var belowY = lastRow.top + lastRow.height + 45 + FLOAT_H/2;
  ['above', 'below'].forEach(function(side){
    var group = floats.filter(function(f){ return f && (f.side === 'below' ? side === 'below' : side === 'above'); });
    if (!group.length) return;
    var xs = group.map(function(f){
      var touching = [];
      (spec.edges || []).forEach(function(e){
        if (e.from === f.id && pos[e.to]) touching.push(pos[e.to].cx);
        if (e.to === f.id && pos[e.from]) touching.push(pos[e.from].cx);
      });
      return touching.length ? touching.reduce(function(a,b){return a+b;},0)/touching.length : W/2;
    });
    xs = spreadPositions(xs, 150 + 24, 75 + 10, W - 75 - 10);
    var fy = side === 'above' ? rowsMeta[0].top - 45 - FLOAT_H/2 : belowY;
    group.forEach(function(f, i){
      /* optional manual nudge (like edge bend/labelDx): dy<0 raises a below
         float up into the inter-row gap; dx shifts it sideways */
      var cx = xs[i] + (typeof f.dx === 'number' ? f.dx : 0);
      var cy = fy + (typeof f.dy === 'number' ? f.dy : 0);
      pos[f.id] = {cx:cx, cy:cy, w:150, h:FLOAT_H, row:-1, flow:-1, stack:false, float:true};
    });
  });

  /* group bounding boxes over member node positions */
  var groupBoxes = Object.create(null);
  Object.keys(spec.nodes || {}).forEach(function(id){
    var g = spec.nodes[id] && spec.nodes[id].group;
    var p = pos[id];
    if (!g || !p) return;
    var b = groupBoxes[g] || (groupBoxes[g] = {x1:Infinity, y1:Infinity, x2:-Infinity, y2:-Infinity});
    b.x1 = Math.min(b.x1, p.cx - p.w/2);
    b.y1 = Math.min(b.y1, p.cy - p.h/2);
    b.x2 = Math.max(b.x2, p.cx + p.w/2);
    b.y2 = Math.max(b.y2, p.cy + p.h/2);
  });
  var GROUP_PAD = 14, GROUP_TITLE = 20;
  Object.keys(groupBoxes).forEach(function(g){
    var parent = parents[g];
    while (parent !== undefined){
      if (!groupBoxes[parent]) groupBoxes[parent] = {x1:Infinity, y1:Infinity, x2:-Infinity, y2:-Infinity};
      parent = parents[parent];
    }
  });
  Object.keys(groupBoxes).sort(function(a, b){ return groupLevel(b) - groupLevel(a); }).forEach(function(g){
    var b = groupBoxes[g];
    b.x = b.x1 - GROUP_PAD; b.y = b.y1 - GROUP_PAD - GROUP_TITLE;
    b.w = (b.x2 - b.x1) + 2*GROUP_PAD; b.h = (b.y2 - b.y1) + 2*GROUP_PAD + GROUP_TITLE;
    b.nestLevel = groupLevel(g);
    var parent = parents[g];
    if (parent !== undefined){
      var outer = groupBoxes[parent];
      outer.x1 = Math.min(outer.x1, b.x); outer.y1 = Math.min(outer.y1, b.y);
      outer.x2 = Math.max(outer.x2, b.x + b.w); outer.y2 = Math.max(outer.y2, b.y + b.h);
    }
  });

  var H = lastRow.top + lastRow.height + 40;
  if (lanes) H += (laneCounts[rowsMeta.length - 1] || 0) * 8;
  floats.forEach(function(f){
    if (f && f.side === 'below' && pos[f.id]) H = Math.max(H, pos[f.id].cy + FLOAT_H/2 + 24);
  });
  Object.keys(groupBoxes).forEach(function(g){
    var b = groupBoxes[g];
    H = Math.max(H, b.y + b.h + 24);
  });
  /* deep nesting pads horizontally past the fixed card columns (and above
     a float member's row) — widen the drawable area instead of clipping.
     Flat specs keep vb = {0, 0, W, H}, so their markup stays identical. */
  var vbX = 0, vbY = 0, vbR = W;
  Object.keys(groupBoxes).forEach(function(g){
    var b = groupBoxes[g];
    if (b.x - 2 < vbX) vbX = b.x - 2;
    if (b.y - 2 < vbY) vbY = b.y - 2;
    if (b.x + b.w + 2 > vbR) vbR = b.x + b.w + 2;
  });
  return {pos:pos, rows:rowsMeta, groups:groupBoxes, H: H,
          vb:{x:vbX, y:vbY, w:vbR - vbX, h:H - vbY},
          routing:lanes ? 'lanes' : undefined};
}

/* Reserved horizontal tracks plus obstacle-free vertical channels. Keep
   this opt-in: authored stacks, floats and self-loops retain classic curves. */
function laneRoutingSupported(d){
  return !(d.floats || []).length && d.rows.every(function(row){
    return row.length > 0 && row.length <= 5 && row.every(function(id){ return typeof id === 'string'; });
  }) && !(d.edges || []).some(function(e){ return e.from === e.to; });
}
function laneEndpoints(d){
  var rowOf = new Map(), endpoints = [];
  d.rows.forEach(function(row,r){ row.forEach(function(id){ rowOf.set(id,r); }); });
  (d.edges || []).forEach(function(e,i){
    var a = rowOf.get(e.from), b = rowOf.get(e.to);
    if (a == null || b == null) return;
    endpoints.push({edge:i, end:'from', id:e.from, other:e.to, side:b>a ? 1 : -1, gap:b>a ? a : a-1});
    endpoints.push({edge:i, end:'to', id:e.to, other:e.from, side:b<a ? 1 : -1, gap:b<a ? b : b-1});
  });
  return endpoints;
}
function laneSegments(points){
  var out = [];
  for (var i=1; i<points.length; i++) if (points[i].x !== points[i-1].x || points[i].y !== points[i-1].y)
    out.push({a:points[i-1], b:points[i]});
  return out;
}
function laneSegmentHits(s, p, margin){
  var x1=p.cx-p.w/2-margin, x2=p.cx+p.w/2+margin;
  var y1=p.cy-p.h/2-margin, y2=p.cy+p.h/2+margin;
  return s.a.x === s.b.x ? s.a.x>x1 && s.a.x<x2 && Math.max(s.a.y,s.b.y)>y1 && Math.min(s.a.y,s.b.y)<y2 :
    s.a.y>y1 && s.a.y<y2 && Math.max(s.a.x,s.b.x)>x1 && Math.min(s.a.x,s.b.x)<x2;
}
function laneConflict(a,b){
  var av=a.a.x===a.b.x, bv=b.a.x===b.b.x;
  if (av === bv){
    var axis=av?'y':'x', fixed=av?'x':'y';
    if (Math.abs(a.a[fixed]-b.a[fixed]) > 2) return 0;
    return Math.max(0, Math.min(Math.max(a.a[axis],a.b[axis]),Math.max(b.a[axis],b.b[axis])) -
      Math.max(Math.min(a.a[axis],a.b[axis]),Math.min(b.a[axis],b.b[axis]))) * 1000;
  }
  var v=av?a:b, h=av?b:a;
  return v.a.x>Math.min(h.a.x,h.b.x) && v.a.x<Math.max(h.a.x,h.b.x) &&
    h.a.y>Math.min(v.a.y,v.b.y) && h.a.y<Math.max(v.a.y,v.b.y) ? 250 : 0;
}
function laneRoutes(d,L){
  var endpoints=laneEndpoints(d), faces=new Map(), gaps=new Map(), ends=[];
  endpoints.forEach(function(p){
    var key=p.id+':'+p.side;
    if (!faces.has(key)) faces.set(key,[]); faces.get(key).push(p);
    if (!gaps.has(p.gap)) gaps.set(p.gap,[]); gaps.get(p.gap).push(p);
    (ends[p.edge] || (ends[p.edge]={}))[p.end]=p;
  });
  faces.forEach(function(items){
    items.sort(function(a,b){ return L.pos[a.other].cx-L.pos[b.other].cx || a.edge-b.edge; });
    items.forEach(function(p,i){
      var n=L.pos[p.id]; p.x=n.cx+(items.length===1 ? 0 : (i/(items.length-1)-.5)*(n.w-40));
      p.y=n.cy+p.side*n.h/2;
    });
  });
  gaps.forEach(function(items,gap){
    var lo=gap<0 ? 0 : L.rows[gap].top+L.rows[gap].height;
    var hi=gap+1>=L.rows.length ? L.H : L.rows[gap+1].top;
    items.sort(function(a,b){ return a.x-b.x || a.edge-b.edge || (a.end<b.end?-1:1); });
    items.forEach(function(p,i){ p.rail=lo+20+(i+.5)*(hi-lo-40)/items.length; });
  });
  var used=[], routes=[];
  (d.edges || []).forEach(function(e,i){
    if (!ends[i]){ routes.push({}); return; }
    var a=ends[i].from, b=ends[i].to, best=null, bestScore=Infinity;
    var xs=[a.x,b.x,(a.x+b.x)/2];
    for (var x=12; x<W-8; x+=8) xs.push(x);
    function consider(points){
      var segs=laneSegments(points), score=0;
      for (var si=0; si<segs.length; si++){
        var s=segs[si];
        // End stubs may touch their own card; every other segment must clear it.
        var blocked=Object.keys(L.pos).some(function(id){
          if ((si===0 && id===e.from) || (si===segs.length-1 && id===e.to)) return false;
          return laneSegmentHits(s,L.pos[id],3);
        });
        if (blocked) return;
        score+=Math.abs(s.a.x-s.b.x)+Math.abs(s.a.y-s.b.y)+15;
        for (var ui=0; ui<used.length; ui++) score+=laneConflict(s,used[ui]);
        if (score>=bestScore) return;
      }
      bestScore=score; best=points;
    }
    if (a.gap===b.gap) consider([{x:a.x,y:a.y},{x:a.x,y:a.rail},{x:b.x,y:a.rail},{x:b.x,y:b.y}]);
    xs.forEach(function(x){ consider([{x:a.x,y:a.y},{x:a.x,y:a.rail},{x:x,y:a.rail},
      {x:x,y:b.rail},{x:b.x,y:b.rail},{x:b.x,y:b.y}]); });
    // Outer channels are always clear for supported rows; never silently draw through a card.
    if (!best) throw new Error('No clear lane for '+e.from+' → '+e.to);
    used=used.concat(laneSegments(best));
    routes.push({path:best.map(function(p,j){ return (j?'L ':'M ')+p.x+' '+p.y; }).join(' '), points:best});
  });
  return routes;
}

/* spread 1-D center positions at least minGap apart inside [lo, hi]; keeps
   relative order, returns positions in the input's order (pure, B3) */
function spreadPositions(xs, minGap, lo, hi){
  var idx = xs.map(function(x, i){ return {x: x, i: i}; }).sort(function(a, b){ return a.x - b.x || a.i - b.i; });
  var placed = [];
  idx.forEach(function(o, j){
    var x = Math.max(o.x, lo);
    if (j > 0) x = Math.max(x, placed[j - 1] + minGap);
    placed.push(x);
  });
  if (placed.length && placed[placed.length - 1] > hi){
    placed[placed.length - 1] = hi;
    for (var j = placed.length - 2; j >= 0; j--){
      placed[j] = Math.min(placed[j], placed[j + 1] - minGap);
    }
    for (var j2 = 0; j2 < placed.length; j2++) placed[j2] = Math.max(placed[j2], lo);
  }
  var out = new Array(xs.length);
  idx.forEach(function(o, j){ out[o.i] = placed[j]; });
  return out;
}

/* ---------------- automatic edge de-crowding (B2, pure) ----------------
   Returns one {fromDx, fromDy, toDx, toDy, bend} per edge:
   - edges sharing a node side fan their attach points apart;
   - reverse pairs on one row bow apart with opposite bends;
   - same-row edges skipping over intermediate slots arc above the row.
   An author-set e.bend is respected (no auto bend for that edge). */
function edgeAutoAdjust(edges, L){
  var adj = edges.map(function(){ return {fromDx:0, fromDy:0, toDx:0, toDy:0, bend:0}; });
  var sides = {};
  function addSide(key, ei, order, axis, slot){
    (sides[key] = sides[key] || {list: [], axis: axis}).list.push({ei: ei, order: order, slot: slot});
  }
  edges.forEach(function(e, ei){
    var a = L.pos[e.from], b = L.pos[e.to];
    if (!a || !b || a.float || b.float) return;
    if (a.row === b.row && Math.abs(a.cx - b.cx) < 1) return;      /* vertical stack edge */
    if (isWrap(e, L)) return;
    if (a.row === b.row){
      var dir = b.cx > a.cx ? 1 : -1;
      addSide(e.from + (dir > 0 ? ':R' : ':L'), ei, b.cx, 'y', 'from');
      addSide(e.to + (dir > 0 ? ':L' : ':R'), ei, a.cx, 'y', 'to');
    } else {
      var up = b.cy < a.cy;
      addSide(e.from + (up ? ':T' : ':B'), ei, b.cx, 'x', 'from');
      addSide(e.to + (up ? ':B' : ':T'), ei, a.cx, 'x', 'to');
    }
  });
  Object.keys(sides).forEach(function(key){
    var s = sides[key];
    if (s.list.length < 2) return;
    s.list.sort(function(p, q){ return p.order - q.order || p.ei - q.ei; });
    var n = s.list.length;
    s.list.forEach(function(p, rank){
      var off = clamp((rank - (n - 1) / 2) * 14, -19, 19);
      if (s.axis === 'y') adj[p.ei][p.slot + 'Dy'] += off;
      else adj[p.ei][p.slot + 'Dx'] += off;
    });
  });
  /* reverse pairs + skip-over arcs (same row only) */
  var pairSeen = {};
  edges.forEach(function(e, ei){
    var a = L.pos[e.from], b = L.pos[e.to];
    if (!a || !b || a.float || b.float || a.row !== b.row) return;
    if (Math.abs(a.cx - b.cx) < 1) return;
    if (typeof e.bend === 'number' && e.bend) return;             /* author wins */
    var key = [e.from, e.to].sort().join('|');
    if (pairSeen[key] != null){
      adj[ei].bend = 16; adj[pairSeen[key]].bend = -16;           /* bow apart */
    } else {
      pairSeen[key] = ei;
    }
    var span = Math.abs(a.flow - b.flow);
    if (span > 1 && !adj[ei].bend) adj[ei].bend = -(26 + 8 * (span - 2)); /* arc over the row */
  });
  return adj;
}

function isWrap(e, L){
  if (L.routing === 'lanes') return false;
  var a = L.pos[e.from], b = L.pos[e.to];
  return a && b && !a.float && !b.float && b.row === a.row + 1 &&
         a.flow === L.rows[a.row].k - 1 && b.flow === 0;
}

/* Straight-drop preference: a cross-row edge (wrap included) whose endpoint
   x-centers align within STRAIGHT_TOL renders as a vertical drop; within
   NEAR_TOL it gets a minimal vertical-tangent S instead of the wide route. */
var STRAIGHT_TOL = 40, NEAR_TOL = 96;

function edgePath(e, L, adj){
  if (adj && adj.path) return adj.path;
  var a = L.pos[e.from], b = L.pos[e.to];
  adj = adj || {fromDx:0, fromDy:0, toDx:0, toDy:0, bend:0};
  var bend = (typeof e.bend === 'number' && e.bend) ? e.bend : (adj.bend || 0);
  var avX = adj.avoidMx || 0, avY = adj.avoidMy || 0;

  if (a.float || b.float){
    /* Attach on the edge each node faces vertically, so a float below its
       partner connects to the partner's BOTTOM (not looped around to the top),
       and a float above connects to the top. Works for either direction. */
    if (b.float){
      var bBelow = b.cy >= a.cy;
      var sx = a.cx + clamp((b.cx - a.cx) * 0.25, -45, 45), sy = a.cy + (bBelow ? a.h/2 : -a.h/2);
      /* Land on the center of the float's facing edge; floatSide (set by
         resolveEdgeAvoidance when no centered route clears the other cards)
         falls back to the near corner so the path can skirt the column. */
      var ex = adj.floatSide ? (b.cx > a.cx ? b.cx - b.w/2 : b.cx + b.w/2) : b.cx;
      var ey = b.cy + (bBelow ? -b.h/2 : b.h/2);
      /* centered landing keeps the final control at ex so the approach stays
         vertical even when an avoidance bow (avX) bends the mid-course */
      var c2x = adj.floatSide ? ex - (ex-sx)*0.3 + avX : ex;
      return 'M ' + sx + ' ' + sy + ' C ' + (sx + (ex-sx)*0.25 + avX) + ' ' + (sy + (ey-sy)*0.5) + ' ' +
             c2x + ' ' + (ey - (ey-sy)*0.35) + ' ' + ex + ' ' + ey;
    }
    var bAbove = b.cy < a.cy;
    var fx = a.cx + clamp((b.cx - a.cx) * 0.3, -50, 50), fy = a.cy + (bAbove ? -a.h/2 : a.h/2);
    var tx = b.cx - clamp((b.cx - a.cx) * 0.25, -45, 45), ty = b.cy + (bAbove ? b.h/2 : -b.h/2);
    return 'M ' + fx + ' ' + fy + ' C ' + (fx + (tx-fx)*0.3 + avX) + ' ' + (fy + (ty-fy)*0.5) + ' ' +
           (tx - (tx-fx)*0.25 + avX) + ' ' + (ty - (ty-fy)*0.35) + ' ' + tx + ' ' + ty;
  }

  /* vertical edge between members of the same stack (e.g. an on-device
     interrupt line between two chips sharing a column) */
  if (a.row === b.row && Math.abs(a.cx - b.cx) < 1 && a.cy !== b.cy){
    var down = b.cy > a.cy;
    var vx = a.cx + (bend || 0) + avX;
    var vsy = a.cy + (down ? a.h/2 : -a.h/2);
    var vty = b.cy + (down ? -b.h/2 : b.h/2);
    return 'M ' + vx + ' ' + vsy + ' L ' + vx + ' ' + vty;
  }

  /* straight-drop / minimal-S for x-aligned cross-row pairs — intercepts
     aligned wrap edges too, so a serpentine junction whose columns line up
     drops straight instead of looping around the margin */
  if (a.row !== b.row && Math.abs(a.cx - b.cx) <= NEAR_TOL){
    var upN = b.cy < a.cy;
    var syN = a.cy + (upN ? -a.h/2 : a.h/2);
    var tyN = b.cy + (upN ? b.h/2 : -b.h/2);
    var lx1 = a.cx + adj.fromDx, lx2 = b.cx + adj.toDx;
    if (avX){
      var dm = tyN - syN;
      return 'M ' + lx1 + ' ' + syN +
             ' C ' + (lx1 + avX) + ' ' + (syN + dm*0.4) + ' ' +
             (lx2 + avX) + ' ' + (tyN - dm*0.4) + ' ' + lx2 + ' ' + tyN;
    }
    if (Math.abs(a.cx - b.cx) <= STRAIGHT_TOL && Math.abs(lx1 - lx2) <= 6){
      return 'M ' + lx1 + ' ' + syN + ' L ' + lx2 + ' ' + tyN;
    }
    var dmn = tyN - syN;
    return 'M ' + lx1 + ' ' + syN +
           ' C ' + lx1 + ' ' + (syN + dmn*0.45) + ' ' +
           lx2 + ' ' + (tyN - dmn*0.45) + ' ' + lx2 + ' ' + tyN;
  }

  if (isWrap(e, L)){
    var side = a.row % 2 === 0 ? 1 : -1;
    var xO = (side > 0 ? W - 58 : 58) + avX;
    var s1x = a.cx + side * a.w/2, t1x = b.cx + side * b.w/2;
    var mid = (a.cy + b.cy) / 2;
    return 'M ' + s1x + ' ' + a.cy +
           ' C ' + (s1x + side*115) + ' ' + a.cy + ' ' + xO + ' ' + (a.cy + 55) + ' ' + xO + ' ' + mid +
           ' C ' + xO + ' ' + (b.cy - 55) + ' ' + (t1x + side*115) + ' ' + b.cy + ' ' + t1x + ' ' + b.cy;
  }

  if (a.row === b.row){
    var effBend = bend + avY;
    var dir = b.cx > a.cx ? 1 : -1;
    var sx2 = a.cx + dir * a.w/2, tx2 = b.cx - dir * b.w/2;
    var sy2 = a.cy + adj.fromDy, ty2 = b.cy + adj.toDy, ddx = tx2 - sx2, ddy = ty2 - sy2;
    if (Math.abs(ddy) < 4 && !effBend) return 'M ' + sx2 + ' ' + sy2 + ' L ' + tx2 + ' ' + ty2;
    if (effBend){ sy2 += effBend * 0.4; ty2 += effBend * 0.4; }
    return 'M ' + sx2 + ' ' + sy2 +
           ' C ' + (sx2 + ddx*0.3) + ' ' + (sy2 + ddy*0.08 + effBend) + ' ' +
           (sx2 + ddx*0.7) + ' ' + (ty2 - ddy*0.1 + effBend) + ' ' + tx2 + ' ' + ty2;
  }

  var up = b.cy < a.cy;
  var sy3 = a.cy + (up ? -a.h/2 : a.h/2);
  var ty3 = b.cy + (up ? b.h/2 : -b.h/2);
  var sx3 = a.cx + clamp((b.cx - a.cx) * 0.05, -30, 30) + adj.fromDx;
  var tx3 = b.cx + clamp((a.cx - b.cx) * 0.05, -30, 30) + adj.toDx;
  var dy = sy3 - ty3;
  return 'M ' + sx3 + ' ' + sy3 +
         ' C ' + (sx3 + avX) + ' ' + (sy3 - dy*0.5) + ' ' +
         (tx3 + (sx3-tx3)*0.3 + avX) + ' ' + (ty3 + dy*0.35) + ' ' + tx3 + ' ' + ty3;
}

/* ---------------- edge/node avoidance (pure core) ----------------
   Light, greedy, deterministic: sample every edge path against every
   foreign node card (inflated by a small margin); an intersecting edge
   tries a bounded candidate set of sideways detours (left/up first at
   each magnitude, magnitudes ascending, so the least deviation wins)
   and keeps the first clean candidate, else the best-scoring one. */
function samplePathD(d){
  var nums = d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g).map(Number);
  var pts = [];
  function bz(p0, p1, p2, p3, t){
    var u = 1 - t;
    return {x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
            y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y};
  }
  var t;
  if (d.indexOf(' C ') < 0){
    for (var li=2; li<nums.length; li+=2) for (t = 0; t <= 1.0001; t += 0.04)
      pts.push({x: nums[li-2] + (nums[li] - nums[li-2]) * t, y: nums[li-1] + (nums[li+1] - nums[li-1]) * t});
    return pts;
  }
  var start = {x: nums[0], y: nums[1]};
  for (var i = 2; i + 5 < nums.length; i += 6){
    var seg = [start, {x: nums[i], y: nums[i+1]}, {x: nums[i+2], y: nums[i+3]}, {x: nums[i+4], y: nums[i+5]}];
    for (t = 0; t <= 1.0001; t += 0.04) pts.push(bz(seg[0], seg[1], seg[2], seg[3], t));
    start = seg[3];
  }
  return pts;
}
function countPathRectHits(pts, rects){
  var hits = 0;
  for (var ri = 0; ri < rects.length; ri++){
    var r = rects[ri];
    for (var pi = 0; pi < pts.length; pi++){
      var q = pts[pi];
      if (q.x > r.x && q.x < r.x + r.w && q.y > r.y && q.y < r.y + r.h){ hits++; break; }
    }
  }
  return hits;
}
var AVOID_MARGIN = 3;
var AVOID_MX = [-44, 44, -78, 78, -112, 112, -146, 146];
var AVOID_MY = [-30, 30, -54, 54, -78, 78];
function resolveEdgeAvoidance(edges, L, adj){
  edges.forEach(function(e, ei){
    var a = L.pos[e.from], b = L.pos[e.to];
    if (!a || !b) return;
    var rects = [];
    Object.keys(L.pos).forEach(function(id){
      if (id === e.from || id === e.to) return;
      var p = L.pos[id];
      rects.push({x: p.cx - p.w/2 - AVOID_MARGIN, y: p.cy - p.h/2 - AVOID_MARGIN,
                  w: p.w + 2*AVOID_MARGIN, h: p.h + 2*AVOID_MARGIN});
    });
    if (!rects.length) return;
    var base = countPathRectHits(samplePathD(edgePath(e, L, adj[ei])), rects);
    if (!base) return;
    var sameRow = !a.float && !b.float && a.row === b.row && Math.abs(a.cx - b.cx) >= 1;
    var cands = sameRow ? AVOID_MY : AVOID_MX;
    var key = sameRow ? 'avoidMy' : 'avoidMx';
    function sweep(){
      var bestVal = 0, best = base;
      for (var ci = 0; ci < cands.length; ci++){
        adj[ei][key] = cands[ci];
        var h = countPathRectHits(samplePathD(edgePath(e, L, adj[ei])), rects);
        if (h < best){ best = h; bestVal = cands[ci]; }
        if (h === 0) break;
      }
      adj[ei][key] = bestVal;
      return best;
    }
    var bestHits = sweep();
    /* center-landed float edge still blocked after every bow: retry the whole
       candidate ladder with the corner attach, which frees the column */
    if (bestHits > 0 && b.float){
      var centerVal = adj[ei][key];
      adj[ei][key] = 0;
      adj[ei].floatSide = true;
      base = countPathRectHits(samplePathD(edgePath(e, L, adj[ei])), rects);
      /* corner wins only when strictly fewer hits; ties keep the center */
      if (sweep() >= bestHits){ adj[ei].floatSide = false; adj[ei][key] = centerVal; }
    }
  });
  return adj;
}

/* ---------------- label collision resolution (B1, pure core) ----------------
   labels: [{x, y, w, h, fixed}] top-left rects (fixed = author-nudged, not moved);
   obstacles: [{x, y, w, h}]. Greedy: each label tries small vertical (then
   horizontal) offsets and takes the first collision-free candidate, else the
   least-overlapping one. Returns [{dx, dy}] in input order. */
function rectsOverlap(a, b){
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function overlapArea(a, b){
  var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (w > 0 && h > 0) ? w * h : 0;
}
function resolveLabelCollisions(labels, obstacles){
  var placed = [];
  var out = [];
  var CAND = [];
  [0, -9, 9, -18, 18, -27, 27, -40, 40, -54, 54].forEach(function(dy){
    [0, -14, 14, -28, 28].forEach(function(dx){ CAND.push({dx: dx, dy: dy}); });
  });
  labels.forEach(function(lb){
    if (lb.fixed){
      placed.push({x: lb.x, y: lb.y, w: lb.w, h: lb.h});
      out.push({dx: 0, dy: 0});
      return;
    }
    var best = CAND[0], bestScore = Infinity;
    for (var ci = 0; ci < CAND.length; ci++){
      var c = CAND[ci];
      var r = {x: lb.x + c.dx, y: lb.y + c.dy, w: lb.w, h: lb.h};
      var score = 0, oi;
      for (oi = 0; oi < obstacles.length; oi++) score += overlapArea(r, obstacles[oi]);
      for (oi = 0; oi < placed.length; oi++) score += overlapArea(r, placed[oi]);
      score += (Math.abs(c.dx) + Math.abs(c.dy)) * 0.01;  /* prefer small moves */
      if (score < bestScore){ bestScore = score; best = c; }
      if (bestScore < 0.02) break;                        /* first clean candidate wins */
    }
    placed.push({x: lb.x + best.dx, y: lb.y + best.dy, w: lb.w, h: lb.h});
    out.push({dx: best.dx, dy: best.dy});
  });
  return out;
}

/* ---------------- deep-link hash (C2/E3, pure core) ---------------- */
function slugify(s){
  var out = String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || 'tab';
}
function sectionSlugify(s){
  var out = String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!out) out = 'section';
  /* Purely numeric slugs would be indistinguishable from the accepted legacy
     rendered-section index, so keep the two namespaces disjoint. */
  if (/^\d+$/.test(out)) out = 'section-' + out;
  return out;
}
function sectionReferences(headings){
  var used = {};
  return (Array.isArray(headings) ? headings : []).map(function(heading, index){
    /* Heading-less sections retain their rendered index as the canonical
       fallback. Heading references are unique document-wide. */
    if (typeof heading !== 'string' || !heading.trim()){
      var positional = String(index + 1);
      used[positional] = true;
      return positional;
    }
    var base = sectionSlugify(heading), ref = base, suffix = 2;
    while (used[ref]) ref = base + '-' + suffix++;
    used[ref] = true;
    return ref;
  });
}
function parseHash(h){
  var kv = {};
  String(h || '').replace(/^#/, '').split('&').forEach(function(part){
    var i = part.indexOf('=');
    if (i > 0){
      try { kv[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1)); }
      catch (ex) { /* malformed escape: ignore that pair */ }
    }
  });
  var result = {b: kv.b != null ? kv.b : null,
          t: kv.t != null ? kv.t : null,
          d: kv.d != null ? kv.d : null,
          c: kv.c != null ? kv.c : null,
          r: kv.r != null ? kv.r : null,
          s: kv.s != null ? kv.s : null,
          x: kv.x != null ? kv.x : null,
          e: kv.e != null ? kv.e : null,
          m: (kv.m === 'step' || kv.m === 'ambient') ? kv.m : null};
  if (kv.p != null) result.p = kv.p;
  return result;
}
function encodeSectionRefList(value){
  return String(value == null ? '' : value).split(',').map(function(ref){
    return encodeURIComponent(ref);
  }).join(',');
}
function buildHash(st){
  var parts = [];
  if (st && st.b != null) parts.push('b=' + encodeURIComponent(st.b));
  if (st && st.t != null) parts.push('t=' + encodeURIComponent(st.t));
  if (st && st.d != null) parts.push('d=' + encodeURIComponent(st.d));
  if (st && st.m) parts.push('m=' + st.m);
  if (st && st.p != null) parts.push('p=' + encodeURIComponent(st.p));
  if (st && st.s != null) parts.push('s=' + encodeURIComponent(st.s));
  if (st && st.c != null) parts.push('c=' + encodeURIComponent(st.c));
  if (st && st.r != null) parts.push('r=' + encodeURIComponent(st.r));
  if (st && st.x != null) parts.push('x=' + encodeSectionRefList(st.x));
  if (st && st.e != null) parts.push('e=' + encodeSectionRefList(st.e));
  return parts.length ? '#' + parts.join('&') : '';
}
function canonicalLinkBase(base){
  if (typeof base !== 'string' || /[\s"]/.test(base)) return null;
  try {
    var parsed = new URL(base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    var href = parsed.href;
    /* Keep the serialized value safe to embed in copied text even if URL
       parsing behavior changes or a non-special URL slips through later. */
    return /[\s"]/.test(href) ? null : href;
  } catch (ex) { return null; }
}
function isValidLinkBase(base){
  return canonicalLinkBase(base) !== null;
}
function composeLinkURL(base, hash){
  var params = String(hash || '').replace(/^#/, '');
  if (!params) return base;
  var tail = base.charAt(base.length - 1);
  return base + (tail === '&' || tail === '#' ? '' :
    (base.indexOf('#') >= 0 ? '&' : '#')) + params;
}
function oneBasedIndex(ref, count){
  if (ref == null || !/^\d+$/.test(String(ref))) return -1;
  var n = parseInt(String(ref), 10) - 1;
  return n >= 0 && n < count ? n : -1;
}
function tabIndexOf(ref, slugs, count){
  if (ref == null) return -1;
  var n = slugs.indexOf(String(ref));
  return n >= 0 ? n : oneBasedIndex(ref, count);
}
function tabReference(slugs, index){
  var slug = slugs[index];
  if (slug != null && slugs.indexOf(slug) === index) return slug;
  var ref = String(index + 1);
  while (slugs.indexOf(ref) >= 0) ref = '0' + ref;
  return ref;
}
function stepIndexOf(stepIds, ref){
  if (ref == null) return -1;
  var str = String(ref);
  for (var i = 0; i < stepIds.length; i++) if (stepIds[i] === str) return i;
  return oneBasedIndex(str, stepIds.length);
}
function stepReference(stepIds, index){
  var id = stepIds[index];
  if (typeof id === 'string' && id && stepIds.indexOf(id) === index &&
      stepIds.lastIndexOf(id) === index) return id;
  var ref = String(index + 1);
  while (stepIds.indexOf(ref) >= 0) ref = '0' + ref;
  return ref;
}

/* Resolve a parsed fragment against a DOM-free page manifest. Canonical links
   use the unique heading-derived section reference for d/c, falling back to a
   rendered section number only when the section has no heading. Numeric d/c
   references remain accepted as legacy rendered indices. Direct diagram and
   contract targets are resolved independently so their state can compose. */
function resolveHashTarget(st, manifest){
  st = st || {};
  manifest = manifest || {};
  var tabs = Array.isArray(manifest.tabBlocks) ? manifest.tabBlocks : [];
  var sections = Array.isArray(manifest.sections) ? manifest.sections : [];
  function sectionAt(ref){
    if (ref == null) return null;
    var key = String(ref), i;
    for (i = 0; i < sections.length; i++)
      if (sections[i].reference != null && String(sections[i].reference) === key)
        return sections[i];
    var n = oneBasedIndex(key, sections.length);
    if (n < 0) return null;
    for (i = 0; i < sections.length; i++)
      if (sections[i].number === n + 1) return sections[i];
    return null;
  }
  function route(sec, out){
    if (sec && sec.tabBlock != null){
      out.tabBlock = sec.tabBlock;
      out.tab = sec.tab;
    }
    return out;
  }
  function diagram(sec, legacy){
    if (!sec || !Array.isArray(sec.stepIds)) return {kind:'invalid'};
    var mode = (st.m === 'step' || st.s != null) ? 'step' :
               (st.m === 'ambient' ? 'ambient' : null);
    var step = mode === 'step' ? (st.s != null ? stepIndexOf(sec.stepIds, st.s) : 0) : null;
    return route(sec, {kind:'diagram', section:sec.number, mode:mode,
                       step:step, legacy:!!legacy, tabBlock:null, tab:null});
  }

  var block = null, blockIndex = st.b != null ? oneBasedIndex(st.b, tabs.length) :
                   (tabs.length ? 0 : -1);
  if (blockIndex >= 0) block = tabs[blockIndex];
  var ti = block ? tabIndexOf(st.t, block.slugs || [], block.count || 0) : -1;
  if (st.t != null && (!block || ti < 0)) return {kind:'invalid'};

  var diagramTarget = null;
  if (st.d != null){
    diagramTarget = diagram(sectionAt(st.d), false);
    if (diagramTarget.kind === 'invalid') return diagramTarget;
  } else if (st.m === 'step' || st.m === 'ambient' || st.s != null){
    var legacySec = null;
    if (block){
      var activeTab = ti >= 0 ? ti : 0;
      for (var j = 0; j < sections.length; j++){
        if (sections[j].tabBlock === block.index && sections[j].tab === activeTab &&
            Array.isArray(sections[j].stepIds)){ legacySec = sections[j]; break; }
      }
    } else {
      for (var k = 0; k < sections.length; k++){
        if (Array.isArray(sections[k].stepIds)){ legacySec = sections[k]; break; }
      }
    }
    diagramTarget = diagram(legacySec, true);
    if (diagramTarget.kind === 'invalid') return diagramTarget;
  }

  var cardTarget = null;
  if (st.c != null){
    var cardSec = sectionAt(st.c);
    if (!cardSec || !cardSec.hasCard) return {kind:'invalid'};
    var row = st.r != null ? oneBasedIndex(st.r, cardSec.rowCount || 0) : null;
    if (row === -1) row = null; /* bad/out-of-range row ref degrades to the card */
    cardTarget = route(cardSec, {kind:row == null ? 'card' : 'row', section:cardSec.number,
                                 row:row, tabBlock:null, tab:null});
  }

  var tabTarget = block && ti >= 0 ? {kind:'tab', tabBlock:block.index, tab:ti} : null;
  /* The card/row is the most specific scroll and route target, followed by
     the diagram and then an explicitly addressed tab. The attached targets
     still all apply even though one supplies the top-level kind. */
  var primary = cardTarget || diagramTarget || tabTarget || {kind:'page'};
  var out = {};
  Object.keys(primary).forEach(function(key){ out[key] = primary[key]; });
  out.diagram = diagramTarget;
  out.card = cardTarget;
  out.explicitTab = tabTarget;
  return out;
}

/* ---------------- stock scenes for the screen widget ---------------- */
function porchSceneBackdrop(night){
  /* Shared fixed artwork, with actual surface colors under day/night light.
     Keep the legacy doorway and floor anchors for the existing clip tracks. */
  return '<rect width="320" height="180" fill="' + (night ? '#192D56' : '#93D4EF') + '"/>' +
    (night ? '<circle cx="275" cy="18" r="9" fill="#FFE4AD"/><g fill="#BED8FF"><circle cx="38" cy="12" r="1"/><circle cx="230" cy="9" r="1"/><circle cx="303" cy="32" r="1"/></g>' : '') +
    '<path d="M0 29H320V150H0Z" fill="' + (night ? '#344D72' : '#EFCBB1') + '"/>' +
    '<path d="M0 30H320M0 51H320M0 73H320M0 95H320M0 117H320M0 139H320" stroke="' + (night ? '#476389' : '#C5A28E') + '" opacity=".5"/>' +
    '<rect y="150" width="320" height="30" fill="' + (night ? '#59657B' : '#BA9673') + '"/>' +
    '<path d="M0 164H320M53 150L38 180M273 150L289 180" stroke="' + (night ? '#7D8593' : '#E6CBA3') + '" opacity=".6"/>' +
    '<rect x="25" y="52" width="64" height="53" rx="2" fill="' + (night ? '#E9AB60' : '#6BB9DA') + '" stroke="#E9D8BC" stroke-width="3"/>' +
    '<path d="M57 52V105M25 78H89" stroke="#F2E5CF" stroke-width="3"/>' +
    '<path d="M31 58H49L31 72ZM63 84H81L63 99Z" fill="#FFF1CC" opacity=".28"/>' +
    '<rect x="114" y="25" width="92" height="129" rx="3" fill="#EAD7B9"/>' +
    '<rect x="118" y="29" width="84" height="121" rx="2" fill="' + (night ? '#277E87' : '#278F92') + '"/>' +
    '<path d="M127 39H193V83H127ZM127 104H193V140H127Z" fill="' + (night ? '#36959C' : '#40ACAA') + '" stroke="#72C6BA"/>' +
    '<circle cx="188" cy="94" r="3" fill="#FFD07B"/>' +
    '<path d="M121 157H201L208 170H114Z" fill="#65544B"/>' +
    (night ? '<path d="M224 61L192 150H260Z" fill="#FFD384" opacity=".12"/><ellipse cx="225" cy="152" rx="42" ry="6" fill="#FFCC80" opacity=".13"/>' : '') +
    '<rect x="219" y="44" width="11" height="22" rx="4" fill="#293B4C"/><rect x="221" y="48" width="7" height="13" rx="2" fill="#FFE2A3"/>' +
    '<path d="M284 137H303L299 153H288Z" fill="#CB7754"/>' +
    '<path d="M293 139V109M293 127Q274 126 280 112Q292 115 293 127M293 119Q310 119 308 104Q295 104 293 119" fill="' + (night ? '#498668' : '#58A762') + '" stroke="#8BC987" stroke-width="2"/>';
}
function doorbellRunScene(pair){
  /* Fixed artwork shared by the two stock clips. Local coordinates put each
     runner's feet at the origin, so distance scales the whole stride/shadow.
     No SVG IDs: multiple doorbells can play independently on the same page. */
  function runner(second){
    return '<g class="doorbell-runner' + (second ? ' doorbell-runner-second' : '') + '">' +
      '<ellipse cx="0" cy="1" rx="13" ry="3" fill="#152B30" opacity=".28"/>' +
      '<g class="doorbell-bounce" stroke-linecap="round" stroke-linejoin="round">' +
      '<g fill="none" stroke="#243D50" stroke-width="6">' +
      '<path class="doorbell-leg doorbell-leg-back" d="M-4-27L-10-14L-5-2"/>' +
      '<path class="doorbell-leg" d="M4-27L11-16L7-3"/>' +
      '</g><g fill="none" stroke="var(--runner-sleeve)" stroke-width="6">' +
      '<path class="doorbell-arm doorbell-arm-back" d="M-8-46L-16-34L-20-42"/>' +
      '<path class="doorbell-arm" d="M8-46L17-35L21-42"/>' +
      '</g><path d="M-8-49Q0-53 8-49L10-28Q0-24-10-28Z" fill="var(--runner-shirt)"/>' +
      '<path d="M-6-49Q0-38 6-49" fill="var(--runner-sleeve)"/>' +
      '<path d="M0-40V-30" stroke="var(--runner-sleeve)" stroke-width="1.2" opacity=".55"/>' +
      '<path d="M-7-29Q0-26 7-29" fill="none" stroke="var(--runner-sleeve)" stroke-width="2"/>' +
      '<path d="M0-54V-51" stroke="#C49070" stroke-width="6"/>' +
      '<circle cx="0" cy="-61" r="8" fill="#D7A27E"/>' +
      '<path d="M-8-60Q-10-72 0-72Q10-71 8-60L5-55H-5Z" fill="#293237"/>' +
      '</g></g>';
  }
  return '<svg viewBox="0 0 320 180" class="scene scene-doorbell" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#87D0ED"/>' +
    '<path d="M24 54Q72 49 112 55T226 53T306 51V85H24Z" fill="#4C936A"/>' +
    '<path d="M43 61L84 35L127 60Z" fill="#345D88"/>' +
    '<path d="M51 60H118V84H51Z" fill="#F0CDA3"/>' +
    '<path d="M62 66H76V77H62ZM91 65H106V78H91Z" fill="#63ACD3"/>' +
    '<path d="M68 66V77M98 65V78" stroke="#DDE0CF" stroke-width="1.4"/>' +
    '<path d="M206 63L244 38L281 63Z" fill="#5068A1"/>' +
    '<path d="M213 62H274V84H213Z" fill="#F0BFAA"/>' +
    '<path d="M225 68H239V79H225ZM249 68H263V79H249Z" fill="#508DBC"/>' +
    '<path d="M31 82Q160 76 290 82V98Q160 92 31 98Z" fill="#516570"/>' +
    '<path d="M40 87Q160 81 280 87" fill="none" stroke="#D2CCAD" stroke-width="1" stroke-dasharray="16 18" opacity=".65"/>' +
    '<path d="M22 99Q160 91 300 99L315 149H5Z" fill="#79AE68"/>' +
    '<path d="M23 97Q160 89 297 97L299 103Q160 94 21 103Z" fill="#D5C7AE"/>' +
    '<path d="M156 99H184L219 148H106Z" fill="#E6D3AD"/>' +
    '<path d="M145 114H195M128 134H210" fill="none" stroke="#C0AD88" stroke-width="1"/>' +
    '<path d="M0 148Q160 136 320 148V180H0Z" fill="#C39E7A"/>' +
    '<path d="M0 158Q160 146 320 158M64 145L41 180M248 145L273 180" fill="none" stroke="#F0D7B0" stroke-width="1.5" opacity=".65"/>' +
    '<path d="M101 171Q158 167 215 171L222 180H94Z" fill="#615E50"/>' +
    '<path d="M42 134L38 93M43 112L54 101" fill="none" stroke="#8C7755" stroke-width="4"/>' +
    '<g fill="#408A5A"><ellipse cx="36" cy="88" rx="20" ry="16"/><ellipse cx="52" cy="98" rx="17" ry="13"/>' +
    '<ellipse cx="279" cy="117" rx="25" ry="14"/><ellipse cx="290" cy="104" rx="20" ry="16"/></g>' +
    runner(false) + (pair ? runner(true) : '') +
    /* Door-frame edges and bowed porch roof suggest the wide doorbell lens. */
    '<path d="M0 0H320V13Q160-2 0 13Z" fill="#273D44"/>' +
    '<path d="M0 0H15Q24 89 14 180H0ZM320 0H305Q297 90 308 180H320Z" fill="#426F79"/>' +
    '<path d="M9 18Q17 90 9 166M312 19Q306 90 314 166" fill="none" stroke="#91B7AD" stroke-width="2" opacity=".55"/>' +
    '<path d="M0 0H45Q3 15 0 49ZM320 0H275Q317 15 320 49ZM0 180V139Q6 171 41 180ZM320 180V139Q314 171 279 180Z" fill="#11272F" opacity=".25"/>' +
    '<text x="293" y="171" text-anchor="end" fill="#F4EEDC" opacity=".85" font-family="monospace" font-size="5" letter-spacing="1">FRONT DOOR · DEMO</text>' +
    '</svg>';
}
var SCENE_LABELS = {
  'person-at-door-night': 'Visitor at night',
  'person-through-door': 'Person walking through a door',
  'doorbell-run-away': 'Doorbell: person running away',
  'doorbell-runners': 'Doorbell: two people running away',
  'package-drop': 'Package delivery',
  'kitchen-fire': 'Kitchen fire',
  'static-noise': 'Static noise'
};
var SCENES = {
  'doorbell-run-away': doorbellRunScene(false),
  'doorbell-runners': doorbellRunScene(true),
  'person-at-door-night':
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    porchSceneBackdrop(true) +
    '<g class="walker"><ellipse cy="152" rx="15" ry="3" fill="#1A2945" opacity=".3"/>' +
    '<path d="M-4 126L-6 147M4 126L6 147" stroke="#385A88" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M-8 148H-3M3 148H9" stroke="#1C304D" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M-8 102L-12 122M8 102L12 119" stroke="#DC9250" stroke-width="6" stroke-linecap="round"/>' +
    '<rect x="-9" y="96" width="18" height="34" rx="6" fill="#F2B65E"/>' +
    '<path d="M0 100V125M-6 115H-2M2 115H6" stroke="#CD824B" stroke-width="1.5"/>' +
    '<path d="M0 93V97" stroke="#C78966" stroke-width="6"/>' +
    '<circle cy="86" r="9" fill="#E9B38A"/><path d="M-9 85Q-9 74 1 76Q10 75 9 85L4 81L-9 83Z" fill="#3D3243"/>' +
    '</g></svg>',
  'package-drop':
    /* courier + package positions are the ANIMATION END STATES' anchors: the
       courier group is parked off-canvas by default CSS (reduced motion shows
       only the delivered package), the package is visible by default and the
       running animation hides it until the drop beat */
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    porchSceneBackdrop(false) +
    '<g class="courier"><ellipse cy="152" rx="15" ry="3" fill="#5E493E" opacity=".2"/>' +
    '<path d="M-4 126L-6 147M4 126L6 147" stroke="#263C64" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M-8 148H-3M3 148H9" stroke="#182B49" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="-9" y="94" width="18" height="34" rx="6" fill="#4C92E0"/>' +
    '<path d="M-6 102H6M-7 120H7" stroke="#ABD8EF" stroke-width="2"/>' +
    '<path d="M-8 100L-11 122M8 101L14 114" stroke="#3273BB" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M0 91V96" stroke="#AA6B48" stroke-width="6"/>' +
    '<circle cy="84" r="9" fill="#CE9367"/><path d="M-9 82Q-9 73 0 74Q10 74 9 82H14V85H-9Z" fill="#2858A0"/>' +
    '<g class="carried"><rect x="9" y="104" width="20" height="15" rx="2" fill="#DEA05E" stroke="#AF713F" stroke-width="1.5"/>' +
    '<path d="M19 105V118" stroke="#F8D39B" stroke-width="3"/></g></g>' +
    '<g class="pkg"><ellipse cx="239" cy="153" rx="27" ry="4" fill="#715443" opacity=".25"/>' +
    '<rect x="216" y="118" width="46" height="34" rx="3" fill="#DEA05E" stroke="#AF713F" stroke-width="2"/>' +
    '<path d="M239 119V151" stroke="#F8D39B" stroke-width="6"/><path d="M217 127H261" stroke="#BB7D43"/>' +
    '<rect x="244" y="134" width="12" height="9" rx="1" fill="#FFF0D3"/><path d="M247 137H253M247 140H251" stroke="#967654"/>' +
    '</g></svg>',
  'person-through-door':
    /* A single six-second entry: approach, door opens, cross the threshold,
       door closes. No IDs or external assets, so many cameras can coexist.
       CSS defaults hold a readable mid-entry pose for reduced motion. */
    '<svg viewBox="0 0 320 180" class="scene scene-entry" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#E7BEA6"/>' +
    '<path d="M0 150H320V180H0Z" fill="#BE9A77"/>' +
    '<path d="M0 160H320M0 177H320M64 150L40 180M140 150L132 180M230 150L242 180" stroke="#E4CFAB" stroke-opacity=".35"/>' +
    '<rect x="28" y="40" width="74" height="66" rx="3" fill="#77BBDD" stroke="#F4DDC0" stroke-width="3"/>' +
    '<path d="M65 40V106M28 73H102" stroke="#EEDBC0" stroke-width="3"/>' +
    '<path d="M34 47H58L34 69ZM72 80H95L72 100Z" fill="#E0F9FF" opacity=".14"/>' +
    '<rect x="168" y="22" width="88" height="132" rx="3" fill="#F3DDC0"/>' +
    '<rect x="174" y="28" width="76" height="124" fill="#D8B47F"/>' +
    '<path d="M174 28H250V48H200V152H174Z" fill="#AD8259"/>' +
    '<path d="M200 48H250V152H200Z" fill="#F3D5A4"/>' +
    '<path d="M210 56H238V107H210Z" fill="#BC9669"/><path d="M213 59H235V104H213Z" fill="#6F9DAD"/>' +
    '<path class="entry-light" d="M174 152H250L282 180H139Z" fill="#FFDB9E" opacity=".22"/>' +
    '<rect x="270" y="58" width="9" height="23" rx="4" fill="#F3E8D5"/>' +
    '<circle cx="274.5" cy="65" r="2" fill="#31A99F"/>' +
    '<ellipse cx="294" cy="152" rx="16" ry="4" fill="#10282E"/>' +
    '<path d="M286 137H303L300 153H289Z" fill="#D57D54"/>' +
    '<path d="M294 140V111M294 126Q275 127 282 114Q294 113 294 126M294 119Q306 120 310 105Q296 103 294 119" fill="#4C9B60" stroke="#77C87A" stroke-width="2"/>' +
    '<g class="entry-person"><ellipse cx="0" cy="155" rx="16" ry="4" fill="#0A1D24" opacity=".3"/>' +
    '<g class="entry-stride" fill="none" stroke-linecap="round">' +
    '<path class="entry-leg entry-leg-back" d="M2 127L-4 141L-7 153" stroke="#182E40" stroke-width="7"/>' +
    '<path class="entry-arm entry-arm-back" d="M0 106L-10 117L-13 128" stroke="#496ABA" stroke-width="6"/>' +
    '<path class="entry-leg" d="M0 126L7 140L9 153" stroke="#294D5E" stroke-width="7"/>' +
    '<path d="M0 105L0 126" stroke="#7894DF" stroke-width="17"/>' +
    '<path class="entry-arm" d="M2 106L12 116L14 126" stroke="#91ADF2" stroke-width="6"/>' +
    '<path d="M1 95V100" stroke="#D9A17E" stroke-width="6"/>' +
    '<circle cx="1" cy="87" r="9" fill="#E4B38B"/>' +
    '<path d="M-7 86Q-9 76 2 76Q12 77 10 86L6 83L-7 84Z" fill="#24313D"/>' +
    '</g></g>' +
    '<g class="entry-door"><rect x="174" y="28" width="76" height="124" fill="#208F94" stroke="#1C657B" stroke-width="2"/>' +
    '<rect x="183" y="39" width="58" height="47" rx="2" fill="#3CAFAD" stroke="#81D4BF"/>' +
    '<rect x="183" y="108" width="58" height="34" rx="2" fill="#21818B" stroke="#58B8B1"/>' +
    '<path d="M231 99H240" stroke="#F4D795" stroke-width="3" stroke-linecap="round"/></g>' +
    '<path d="M172 28V153H251" fill="none" stroke="#F5E6CA" stroke-width="3"/>' +
    '<rect x="197" y="158" width="52" height="10" rx="3" fill="#10282E" opacity=".65"/>' +
    '</svg>',
  'kitchen-fire':
    '<svg viewBox="0 0 320 180" class="scene scene-fire" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#F0D1B2"/>' +
    '<path d="M0 143H320V180H0Z" fill="#C79A78"/>' +
    '<path d="M0 162H320M57 143L42 180M139 143L133 180M235 143L247 180" stroke="#E8C5A0" stroke-opacity=".35"/>' +
    '<rect x="23" y="33" width="84" height="62" rx="2" fill="#6FBCDF" stroke="#FFF0D4" stroke-width="3"/>' +
    '<path d="M65 33V95M23 63H107" stroke="#F7E8CD" stroke-width="3"/>' +
    '<path d="M30 41H57L30 58ZM72 70H99L72 88Z" fill="#E4F9FF" opacity=".15"/>' +
    '<rect x="16" y="110" width="292" height="40" rx="2" fill="#287A91"/>' +
    '<path d="M24 116H87V144H24ZM96 116H163V144H96ZM172 117H197V144H172Z" fill="#429BB0" stroke="#78C7CE"/>' +
    '<path d="M74 122H79M150 122H155M185 122H190" stroke="#E6C27A" stroke-width="2" stroke-linecap="round"/>' +
    '<rect x="203" y="111" width="72" height="39" fill="#263C49"/>' +
    '<rect x="213" y="122" width="52" height="22" rx="2" fill="#102633" stroke="#66808D"/>' +
    '<path d="M217 127H260" stroke="#92A3A9" stroke-width="2"/>' +
    '<circle cx="221" cy="116" r="2" fill="#C0C7BE"/><circle cx="237" cy="116" r="2" fill="#C0C7BE"/><circle cx="253" cy="116" r="2" fill="#C0C7BE"/>' +
    '<rect x="12" y="104" width="300" height="8" rx="2" fill="#EEE4D0"/>' +
    '<path d="M116 104V91Q116 84 123 84Q130 84 130 91" fill="none" stroke="#B9C9C6" stroke-width="3"/>' +
    '<ellipse cx="144" cy="106" rx="24" ry="2" fill="#3A5661"/>' +
    '<g class="fire-glow"><ellipse cx="234" cy="99" rx="78" ry="74" fill="#F98036" opacity=".12"/>' +
    '<ellipse cx="234" cy="105" rx="46" ry="52" fill="#FFB45C" opacity=".13"/>' +
    '<ellipse cx="234" cy="159" rx="60" ry="11" fill="#FFAC55" opacity=".18"/></g>' +
    '<g fill="#746779"><g class="fire-smoke"><circle cx="237" cy="64" r="14" opacity=".23"/><circle cx="224" cy="55" r="18" opacity=".19"/></g>' +
    '<g class="fire-smoke fire-smoke-late"><circle cx="241" cy="65" r="18" opacity=".2"/><circle cx="224" cy="55" r="15" opacity=".16"/></g></g>' +
    '<ellipse cx="235" cy="105" rx="32" ry="3" fill="#182A34"/>' +
    '<path d="M214 96H258L253 108H220Z" fill="#253D4A" stroke="#819096" stroke-width="1.5"/>' +
    '<path d="M256 97H270" stroke="#667B84" stroke-width="3" stroke-linecap="round"/>' +
    '<path class="fire-flame fire-outer" d="M216 100C202 87 217 72 215 59C225 64 226 74 228 77C231 61 243 53 239 35C260 54 247 64 252 75C259 72 259 66 259 62C273 82 266 98 254 103Z" fill="#EE6938"/>' +
    '<path class="fire-flame fire-middle" d="M221 101C212 90 226 82 224 70C232 75 232 82 234 84C243 75 244 62 243 56C257 72 246 79 251 89C258 85 257 80 257 78C264 92 254 103 245 105Z" fill="#FFB74F"/>' +
    '<path class="fire-flame fire-core" d="M230 103C224 98 231 90 233 84C240 89 235 94 241 96C247 91 246 87 247 85C255 97 247 106 239 107Z" fill="#FFE6A0"/>' +
    '<g fill="#FFD180"><circle class="fire-ember" cx="229" cy="66" r="1.5"/>' +
    '<circle class="fire-ember fire-ember-late" cx="252" cy="72" r="1.2"/></g>' +
    '<ellipse cx="157" cy="21" rx="13" ry="5" fill="#FFF3DB"/>' +
    '<path d="M150 21H159" stroke="#627F8F" stroke-width="1.5"/>' +
    '<circle class="fire-alarm" cx="164" cy="21" r="1.8" fill="#FF8658"/>' +
    '</svg>',
  'static-noise':
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#182C49"/>' +
    '<g opacity=".7"><path d="M0 0H46V118H0Z" fill="#DAE4E9"/><path d="M46 0H92V118H46Z" fill="#E2BF58"/>' +
    '<path d="M92 0H138V118H92Z" fill="#51BCCB"/><path d="M138 0H184V118H138Z" fill="#66BC83"/>' +
    '<path d="M184 0H230V118H184Z" fill="#B474C9"/><path d="M230 0H276V118H230Z" fill="#D6737E"/>' +
    '<path d="M276 0H320V118H276Z" fill="#538ECE"/></g>' +
    '<path d="M0 124H80V144H0Z" fill="#27507D"/><path d="M80 124H160V144H80Z" fill="#BDD5DE"/>' +
    '<path d="M160 124H240V144H160Z" fill="#725687"/><path d="M240 124H320V144H240Z" fill="#2D3E60"/>' +
    '<g class="flick" opacity=".32"><path d="M0 12H320V16H0ZM0 90H320V92H0Z" fill="#DCF0FA"/>' +
    '<path d="M0 52H320V56H0ZM0 132H320V135H0Z" fill="#142640"/>' +
    '<path d="M0 160H109V162H0Z" fill="#5DBECC"/><path d="M176 160H320V162H176Z" fill="#CD78B4"/></g></svg>'
};

/* ---------------- board renderer ---------------- */
function renderBoard(el, d, prefix, skin, protos, backlinks){
  if(el._nodeLinks){el._nodeLinks.destroy();el._nodeLinks=null;}
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
  var s = '<svg viewBox="' + vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h + '" role="img" aria-label="' + esc(d.title || 'flow diagram') + '" xmlns="' + SVGNS + '">';
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
    s += '<g class="node tint-' + tint + (n.delta === true ? ' dvd' : '') + '" id="' + prefix + '-n-' + esc(id) + '" data-dv-node="' + esc(id) + '" transform="translate(' + x + ' ' + y + ')">' +
         (L.routing === 'lanes' ? '<title>'+esc(nodeTitle)+'</title>' : '') +
         '<rect class="card" width="' + p.w + '" height="' + p.h + '" rx="12"/>' +
         '<rect class="icbg" x="12" y="' + (small?9:14) + '" width="26" height="26" rx="8"/>' +
         '<use href="#i-' + icon + '" x="17" y="' + (small?14:19) + '" width="16" height="16"/>' +
         '<text class="t1" x="46" y="' + (small?22:25) + '">' + esc(shownTitle) + '</text>' +
         '<text class="t2" x="46" y="' + (small?36:41) + '">' + esc(n.sub || '') + '</text>' +
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
  wireNodeBacklinks(el, svg, d, prefix, backlinks);
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
      if (wrap){ anchor = 'end'; lx = mid.x - 18 + (e.labelDx || 0); ly = mid.y - 4 + (e.labelDy || 0); }
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
function traceIntervalUnion(intervals){
  var sorted=intervals.filter(function(v){ return v[1]>v[0]; }).map(function(v){ return v.slice(); })
    .sort(function(a,b){ return a[0]-b[0] || a[1]-b[1]; }), out=[];
  sorted.forEach(function(v){
    var last=out[out.length-1];
    if (last && v[0]<=last[1]) last[1]=Math.max(last[1],v[1]); else out.push(v);
  });
  return out;
}
function traceTimingModel(panel,state){
  var data=tracePanelData(panel);
  if (data.errors.length) return {errors:data.errors,notices:data.notices};
  var spans=data.spans.sort(function(a,b){ return a.startMs-b.startMs || (a.id<b.id?-1:a.id>b.id?1:0); });
  var byId=new Map(), children=new Map();
  spans.forEach(function(s){ byId.set(s.id,s); });
  spans.forEach(function(s){ if (!children.has(s.parentId)) children.set(s.parentId,[]); children.get(s.parentId).push(s); });
  var selected=state && state.selected!=null ? byId.get(state.selected) : spans[0];
  if (!selected) return {errors:['Selected span is unavailable.'],notices:data.notices};
  function duration(intervals){ return intervals.reduce(function(sum,v){ return sum+(v[1]-v[0]); },0); }
  function stats(s){
    var childSpans=children.get(s.id)||[];
    var covered=traceIntervalUnion(childSpans.map(function(c){ return [Math.max(s.startMs,c.startMs),Math.min(s.startMs+s.ms,c.startMs+c.ms)]; }));
    var childMs=Math.min(s.ms,duration(covered));
    return {span:s,covered:covered,childMs:childMs,uncoveredMs:Math.max(0,s.ms-childMs),children:childSpans};
  }
  var serviceSpans=spans.filter(function(s){ return s.service===selected.service; });
  var serviceIntervals=traceIntervalUnion(serviceSpans.map(function(s){ return [s.startMs,s.startMs+s.ms]; }));
  var serviceStart=Math.min.apply(null,serviceSpans.map(function(s){ return s.startMs; }));
  var serviceEnd=Math.max.apply(null,serviceSpans.map(function(s){ return s.startMs+s.ms; }));
  var rows=[];
  function visit(s,depth){
    if (s.service===selected.service){ var row=stats(s); row.depth=depth; rows.push(row); }
    (children.get(s.id)||[]).forEach(function(c){ visit(c,depth+1); });
  }
  spans.filter(function(s){ return !s.parentId || !byId.has(s.parentId); }).forEach(function(s){ visit(s,0); });
  return {errors:[],notices:data.notices,selected:stats(selected),rows:rows,service:selected.service,
    serviceStart:serviceStart,serviceEnd:serviceEnd,serviceCoverageMs:duration(serviceIntervals)};
}
function tracePanelHTML(panel,state,states){
  var m=traceTimingModel(panel,state);
  function ms(n){ return String(Math.round(n*1000)/1000)+' ms'; }
  if (m.errors.length) return '<div class="tr-time"><b>Timing unavailable</b><p>'+esc(m.errors.join(' · '))+'</p></div>';
  var s=m.selected, duration=s.span.ms, h='<div class="tr-time">';
  var serviceSteps=new Map(), spanServices=new Map();
  panel.spans.forEach(function(span){ spanServices.set(span.id,span.service); });
  (states||[]).forEach(function(st,i){ var service=st && spanServices.get(st.selected); if (service && !serviceSteps.has(service)) serviceSteps.set(service,i); });
  if (serviceSteps.size>1){
    h+='<label class="tr-picker">Inspect service<select data-dv-trace-service aria-label="Inspect service">';
    serviceSteps.forEach(function(i,service){ h+='<option value="'+i+'"'+(service===m.service?' selected':'')+'>'+esc(service)+'</option>'; });
    h+='</select></label>';
  }
  h+='<div class="tr-service">'+esc(m.service)+'</div><p class="tr-coverage">Service span coverage (union): <b>'+ms(m.serviceCoverageMs)+'</b> · '+m.rows.length+' observed span(s)</p>';
  h+='<div class="tr-selected"><b>'+esc(s.span.name)+'</b><code>'+esc(s.span.id)+'</code><small>Parent: '+esc(s.span.parentId||'none')+'</small></div>';
  h+='<dl class="tr-metrics"><div><dt>Inclusive</dt><dd>'+ms(duration)+'</dd></div><div><dt>Child-covered</dt><dd>'+ms(s.childMs)+'</dd></div><div><dt>Uncovered</dt><dd>'+ms(s.uncoveredMs)+'</dd></div></dl>';
  h+='<div class="tr-interval'+(duration===0?' tr-zero':'')+'" role="img" aria-label="'+esc('Selected span: '+ms(duration)+' inclusive, '+ms(s.childMs)+' child-covered, '+ms(s.uncoveredMs)+' uncovered')+'">';
  s.covered.forEach(function(v){
    h+='<span class="tr-covered" style="left:'+((v[0]-s.span.startMs)/duration*100).toFixed(4)+'%;width:'+((v[1]-v[0])/duration*100).toFixed(4)+'%"></span>';
  });
  h+='</div><p class="tr-key">'+(duration===0?'Zero-duration span; no wall-time interval.':'<span>Blue: child-covered</span> · <span>Hatched: uncovered</span>')+'</p>';
  h+='<p class="tr-explain">Direct-child intervals count once where they overlap and are clipped to this span. Uncovered wall time can include local work, waiting, and missing instrumentation; it is not CPU time.</p>';
  m.notices.forEach(function(n){ h+='<p class="tr-notice">'+esc(n)+'</p>'; });
  h+='<div class="tr-ophead">Service operations · inclusive / uncovered</div><div class="tr-operations">';
  m.rows.forEach(function(r){
    var step=(states||[]).findIndex(function(st){ return st && st.selected===r.span.id; });
    var extent=m.serviceEnd-m.serviceStart, selected=r.span.id===s.span.id;
    var description=r.span.name+' · '+r.span.id+' · parent '+(r.span.parentId||'none')+' · +'+ms(r.span.startMs)+' · '+ms(r.span.ms)+' inclusive / '+ms(r.uncoveredMs)+' uncovered'+(r.span.error===true?' · recorded error':'');
    h+='<'+(step>=0?'button type="button" data-dv-trace-step="'+step+'"':'div')+' class="tr-op'+(selected?' tr-current':'')+'" title="'+esc(description)+'"'+(step>=0?' aria-label="Inspect '+esc(description)+'"':'')+'>';
    h+='<span class="tr-opname">'+(r.depth?'↳ ':'')+esc(r.span.name)+(r.span.error===true?' · ERROR':'')+'</span><span class="tr-opvalues">'+ms(r.span.ms)+' / '+ms(r.uncoveredMs)+'</span>';
    h+='<span class="tr-optrack"><span style="left:'+(extent?(r.span.startMs-m.serviceStart)/extent*100:0).toFixed(4)+'%;width:'+(extent?r.span.ms/extent*100:0).toFixed(4)+'%"></span></span>';
    h+='</'+(step>=0?'button':'div')+'>';
  });
  h+='</div><p class="tr-explain">Rows share the service’s +'+ms(m.serviceStart)+' to +'+ms(m.serviceEnd)+' scale. Nested spans overlap; row durations must not be added. The parent ID remains in each row’s tooltip.</p>';
  if (s.children.length){
    h+='<details class="tr-children"><summary>'+s.children.length+' direct child span(s)</summary><ul>';
    s.children.forEach(function(c){ h+='<li>'+esc(c.service+' · '+c.name)+' · '+ms(c.ms)+(c.service===m.service?' · same service':' · other service')+'</li>'; });
    h+='</ul></details>';
  }
  return h+'</div>';
}

function waterfallModel(spans, state){
  spans = Array.isArray(spans) ? spans : [];
  state = state || {};
  var total = 0, cursor = 0;
  var timed = spans.some(function(s){ return s && isFiniteNum(s.startMs) && s.startMs >= 0; });
  var measured = spans.map(function(s){
    var ms = s && isFiniteNum(s.ms) && s.ms > 0 ? s.ms : 0;
    var start = s && isFiniteNum(s.startMs) && s.startMs >= 0 ? s.startMs : cursor;
    cursor = start + ms;
    total = Math.max(total, cursor);
    return {ms: ms, start: start};
  });
  var reveal = (typeof state.reveal === 'number') ? clamp(state.reveal, 0, spans.length) : spans.length;
  var shown = 0, rows = [];
  spans.forEach(function(s, i){
    var ms = measured[i].ms, off = measured[i].start;
    var revealed = i < reveal;
    if (revealed) shown = Math.max(shown, off + ms);
    rows.push({id: s && s.id, label: (s && (s.label || s.id)) || '', ms: ms,
               startMs: off, error: !!(s && s.error === true),
               offsetPct: total ? off / total * 100 : 0,
               widthPct: total ? ms / total * 100 : 0,
               revealed: revealed, highlight: !!(s && state.highlight === s.id)});
  });
  return {rows: rows, totalMs: total, shownMs: shown, timed: timed,
          totalLabel: state.total != null ? String(state.total) : shown + ' ms'};
}

function orbitPositions(n, cx, cy, r){
  var out = [];
  for (var i = 0; i < n; i++){
    var a = -Math.PI / 2 + i * 2 * Math.PI / n;
    out.push({x: cx + r * Math.cos(a), y: cy + r * Math.sin(a)});
  }
  return out;
}

/* zones/layers patches replace the whole array (fold is a shallow merge);
   the model joins the declared geometry with the latest state array. */
function zoneModel(declared, stateZones){
  var ZKINDS = ['armed','ignored','masked'];
  var st = {};
  (Array.isArray(stateZones) ? stateZones : []).forEach(function(z){
    if (z && z.id) st[z.id] = z.state;
  });
  return (Array.isArray(declared) ? declared : []).map(function(z){
    z = z || {};
    var s = st[z.id] != null ? st[z.id] : (z.state || 'armed');
    if (ZKINDS.indexOf(s) < 0) s = 'armed';
    var zpts = (Array.isArray(z.points) ? z.points : []).filter(function(p){
      return Array.isArray(p) && typeof p[0] === 'number' && isFinite(p[0]) &&
             typeof p[1] === 'number' && isFinite(p[1]);
    });
    return {id: z.id, label: z.label || z.id || '', state: s, points: zpts};
  });
}

function xrayModel(declared, stateLayers){
  var st = {};
  (Array.isArray(stateLayers) ? stateLayers : []).forEach(function(l){
    if (l && l.id) st[l.id] = l.open === true;
  });
  return (Array.isArray(declared) ? declared : []).map(function(l){
    l = l || {};
    return {id: l.id, label: l.label || l.id || '', holder: l.holder || '',
            open: st[l.id] === true};
  });
}

/* pir line-of-sight widget: a mounted IR/PIR sensor projects a field-of-view
   cone; a subject dot is tested against it and rendered tripped or clear. Pure
   model (node-testable, no DOM). Frame is 320x180. `facing` is degrees measured
   clockwise from +x in screen space (y grows downward): 0=right, 90=down,
   180=left, 270=up. Containment = within range AND within half the spread of
   the facing direction. An explicit state.tripped overrides the computation. */
function pirModel(panel, state){
  panel = panel || {}; state = state || {};
  var sensor = panel.sensor && typeof panel.sensor.x === 'number' && typeof panel.sensor.y === 'number'
    ? {x: panel.sensor.x, y: panel.sensor.y} : {x: 298, y: 78};
  var cone = panel.cone || {};
  var facing = typeof cone.facing === 'number' ? cone.facing : 180;
  var spread = typeof cone.spread === 'number' ? clamp(cone.spread, 4, 340) : 66;
  var range = typeof cone.range === 'number' && cone.range > 0 ? cone.range : 250;
  var f = facing * Math.PI / 180;
  var half = spread / 2 * Math.PI / 180;
  var N = 16, pts = [[sensor.x, sensor.y]];
  for (var i = 0; i <= N; i++){
    var a = f - half + (2 * half) * (i / N);
    pts.push([sensor.x + range * Math.cos(a), sensor.y + range * Math.sin(a)]);
  }
  var subj = state.subject && typeof state.subject.x === 'number' && typeof state.subject.y === 'number'
    ? {x: state.subject.x, y: state.subject.y} : null;
  var tripped = false;
  if (subj){
    var dx = subj.x - sensor.x, dy = subj.y - sensor.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0){ tripped = true; }
    else if (dist <= range){
      var diff = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - f), Math.cos(Math.atan2(dy, dx) - f)));
      if (diff <= half) tripped = true;
    }
  }
  if (state.tripped === true) tripped = true;
  if (state.tripped === false) tripped = false;
  return {sensor: sensor, cone: {facing: facing, spread: spread, range: range},
          conePoints: pts, subject: subj, tripped: tripped,
          path: (function(){
            var pp = (Array.isArray(panel.path) ? panel.path : []).filter(function(p){
              return Array.isArray(p) && typeof p[0] === 'number' && isFinite(p[0]) &&
                     typeof p[1] === 'number' && isFinite(p[1]);
            });
            return pp.length >= 2 ? pp : null;
          })(),
          banner: state.banner != null ? String(state.banner) : '',
          status: state.status != null ? String(state.status) : null};
}

/* thermo widget: a device temperature readout against warning / critical
   shutdown thresholds. Pure model (node-testable, no DOM). The engine COMPUTES
   the zone (ok / warn / crit) from the value and the declared thresholds
   rather than trusting the author to assert it; `state.label` overrides only
   the zone-chip caption. A missing value renders as a dash (zone 'na').
   Reversed warn/crit are swapped (the validator warns). */
var THERMO_ZONE_LABELS = {ok: 'NOMINAL', warn: 'WARNING', crit: 'CRITICAL', 'cold-warn':'COLD WARNING', 'cold-crit':'TOO COLD', na: 'NO DATA'};
function thermoModel(panel, state){
  panel = panel || {}; state = state || {};
  /* finite-only: JSON overflow literals (1e400) parse to Infinity, which is
     typeof 'number' but would poison every percentage into NaN and emit
     invalid SVG/CSS attribute values — treat non-finite as absent */
  function fin(v){ return typeof v === 'number' && isFinite(v) ? v : null; }
  var limits = thermoLimits(panel), min = limits.min, max = limits.max;
  var warn = limits.warn, crit = limits.crit, lowWarn = limits.lowWarn, lowCrit = limits.lowCrit;
  var value = fin(state.value);
  var zone = 'na';
  if (value != null){
    zone = 'ok';
    if (lowWarn != null && value <= lowWarn) zone = 'cold-warn';
    if (lowCrit != null && value <= lowCrit) zone = 'cold-crit';
    if (warn != null && value >= warn) zone = 'warn';
    if (crit != null && value >= crit) zone = 'crit';
  }
  function pct(v){ return clamp((v - min) / (max - min) * 100, 0, 100); }
  return {value: value, min: min, max: max, warn: warn, crit: crit, lowWarn:lowWarn, lowCrit:lowCrit, zone: zone,
          unit: panel.unit != null ? String(panel.unit) : '°C',
          pct: value != null ? pct(value) : 0,
          warnPct: warn != null ? pct(warn) : null,
          critPct: crit != null ? pct(crit) : null,
          lowWarnPct: lowWarn != null ? pct(lowWarn) : null,
          lowCritPct: lowCrit != null ? pct(lowCrit) : null,
          label: state.label != null ? String(state.label) : THERMO_ZONE_LABELS[zone]};
}

/* battery widget: charge level where LOW is bad — the inverse of thermo's
   zones. Pure model (node-testable). The engine COMPUTES the zone (ok / low /
   crit, both thresholds inclusive at-or-below) from the charge and the
   declared thresholds; `state.label` overrides only the zone-chip caption.
   Non-finite numbers (JSON 1e400 → Infinity) are treated as absent. Charge
   is a percentage, clamped to 0–100. Reversed thresholds (crit > low) are
   swapped (the validator warns). */
var BATTERY_ZONE_LABELS = {ok: 'NOMINAL', low: 'LOW', crit: 'CRITICAL', na: 'NO DATA'};
var BATTERY_SOURCES = ['solar', 'wired', 'poe', 'cells'];
var BATTERY_TRENDS = ['charging', 'draining', 'idle'];
function batteryModel(panel, state){
  panel = panel || {}; state = state || {};
  function fin(v){ return typeof v === 'number' && isFinite(v) ? v : null; }
  var low = fin(panel.low) != null ? clamp(panel.low, 0, 100) : null;
  var crit = fin(panel.crit) != null ? clamp(panel.crit, 0, 100) : null;
  if (low != null && crit != null && crit > low){ var sw = low; low = crit; crit = sw; }
  var charge = fin(state.charge) != null ? clamp(state.charge, 0, 100) : null;
  var zone = 'na';
  if (charge != null){
    zone = 'ok';
    if (low != null && charge <= low) zone = 'low';
    if (crit != null && charge <= crit) zone = 'crit';
  }
  var trend = BATTERY_TRENDS.indexOf(state.trend) >= 0 ? state.trend : null;
  var source = BATTERY_SOURCES.indexOf(state.source) >= 0 ? state.source : null;
  return {charge: charge, low: low, crit: crit, zone: zone,
          trend: trend, source: source, cold: state.cold === true,
          note: state.note != null ? String(state.note) : '',
          label: state.label != null ? String(state.label) : BATTERY_ZONE_LABELS[zone]};
}

/* tiles widget: a device-fleet grid — one named tile per device/cohort with
   a state chip and an optional sub-line. Pure model (node-testable). Tiles
   and the state vocabulary (states + colors, like the state widget) are
   DECLARED once; each step patches per tile id (like leds/signal): a patch
   replaces that tile's whole `{state, sub}` status. A state not in the
   declared list renders the tile dimmed with '—' (validator warns). */
function tilesModel(panel, state){
  panel = panel || {}; state = state || {};
  var vocab = Array.isArray(panel.states) ? panel.states.map(String) : [];
  var colors = panel.colors || {};
  return (Array.isArray(panel.tiles) ? panel.tiles : []).slice(0, 12).map(function(t){
    t = t || {};
    var st = (t.id && state[t.id] && typeof state[t.id] === 'object') ? state[t.id] : {};
    var sname = st.state != null ? String(st.state) : null;
    var known = sname != null && (vocab.length === 0 || vocab.indexOf(sname) >= 0);
    return {id: t.id, label: t.label || t.id || '',
            state: known ? sname : null,
            color: known && isHex(colors[sname]) ? colors[sname] : null,
            sub: st.sub != null ? String(st.sub) : ''};
  }).filter(function(t){ return t.id; });
}

/* signal widget: link health for 1–6 named radio/wired links. Pure model
   (node-testable). Links are DECLARED once (id, label, transport tag); each
   step patches per link id, like the leds widget: a patch value replaces that
   link's whole status object `{state, bars, note}`. Unknown state tokens fall
   back to 'ok' (validator warns); bars 0–4 or null (chip-only). */
var SIGNAL_STATES = ['ok','weak','retrying','lost','jammed'];
var SIGNAL_TRANSPORTS = ['wifi','subghz','thread','zigbee','zwave','cellular','poe','ethernet','ble'];
function signalModel(panel, state){
  panel = panel || {}; state = state || {};
  function fin(v){ return typeof v === 'number' && isFinite(v) ? v : null; }
  return (Array.isArray(panel.links) ? panel.links : []).slice(0, 6).map(function(l){
    l = l || {};
    var st = (l.id && state[l.id] && typeof state[l.id] === 'object') ? state[l.id] : {};
    var s = SIGNAL_STATES.indexOf(st.state) >= 0 ? st.state : 'ok';
    var bars = fin(st.bars) != null ? Math.round(clamp(st.bars, 0, 4)) : null;
    return {id: l.id, label: l.label || l.id || '',
            transport: SIGNAL_TRANSPORTS.indexOf(l.transport) >= 0 ? l.transport : null,
            state: s, bars: bars,
            note: st.note != null ? String(st.note) : ''};
  }).filter(function(l){ return l.id; });
}

/* radar widget: a top-down range view — concentric distance rings inside a
   wedge, an alert-threshold arc, named zone polygons, and a subject whose
   distance is measured. Pure model (node-testable). The engine COMPUTES:
   the subject's distance from the sensor, whether it is inside the alert
   threshold (state.alert overrides), and which zones contain it
   (point-in-polygon). The track drawn across steps is render-level (from the
   folded state history), not part of this model. Frame is 320x180, y down;
   `facing`/`spread` follow the pir convention (degrees clockwise from +x). */
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
var HOMEMAP_DISPLAY_HEIGHT = 216;
var HOMEMAP_Y_SCALE = HOMEMAP_DISPLAY_HEIGHT / 180;
function homemapPointFromDisplay(point){
  return {x:Math.round(clamp(point.x, 0, 320)), y:Math.round(clamp(point.y / HOMEMAP_Y_SCALE, 0, 180))};
}
function homemapModel(panel, state){
  panel = panel || {}; state = state || {};
  function fin(v){ return typeof v === 'number' && isFinite(v) ? v : null; }
  var box = panel.outline || {};
  var w = fin(box.w) != null ? clamp(box.w, 20, 320) : 300;
  var h = fin(box.h) != null ? clamp(box.h, 20, 180) : 160;
  var ox = fin(box.x) != null ? clamp(box.x, 0, 320 - w) : (320 - w) / 2;
  var oy = fin(box.y) != null ? clamp(box.y, 0, 180 - h) : (180 - h) / 2;
  var byId = Object.create(null), seen = Object.create(null), devices = [];
  (Array.isArray(panel.devices) ? panel.devices : []).forEach(function(d){
    if (!d || typeof d.id !== 'string' || seen[d.id]) return;
    seen[d.id] = true;
    if (!homemapDeviceValid(d)) return;
    var vocab = HOMEMAP_STATES[d.kind];
    var x = clamp(d.x, 0, 320), y = clamp(d.y, 0, 180);
    var floorDoor = d.kind === 'entry' && d.display === 'door';
    var devicePatch = Object.prototype.hasOwnProperty.call(state, d.id) ? state[d.id] : undefined;
    var operating = panelObject(devicePatch) ? devicePatch.state : devicePatch;
    var facing = fin(d.facing) != null ? d.facing : floorDoor ? 0 : Math.atan2(90 - y, 160 - x) * 180 / Math.PI;
    var item = {id: d.id, kind: d.kind, label: String(d.label != null ? d.label : d.id),
      x: x, y: y, state: vocab.indexOf(operating) >= 0 ? operating : vocab[0],
      thermal: panelObject(devicePatch) && HOMEMAP_THERMAL.indexOf(devicePatch.thermal) >= 0 ? devicePatch.thermal : 'normal',
      icon: ICON_SET.indexOf(d.icon) >= 0 ? d.icon : 'gear',
      facing: ((facing % 360) + 360) % 360,
      spread: fin(d.spread) != null ? clamp(d.spread, 10, 180) : 80,
      range: fin(d.range) != null ? clamp(d.range, 20, 160) : 70};
    if (floorDoor){
      item.display = 'door';
      item.doorWidth = fin(d.doorWidth) != null ? clamp(d.doorWidth, 8, 48) : 24;
      item.doorSwing = fin(d.doorSwing) != null && Math.abs(d.doorSwing) >= 15 && Math.abs(d.doorSwing) <= 135 ? d.doorSwing : 90;
    }
    byId[d.id] = item; devices.push(item);
  });
  var subjects = homemapSubjects(panel).map(function(sub){
    var value = Object.prototype.hasOwnProperty.call(state, sub.id) ? state[sub.id] : undefined;
    var position = homemapSubjectPosition(value) ? value : sub;
    return {id: sub.id, label: String(sub.label != null ? sub.label : sub.id),
      icon: sub.icon === undefined ? null : (ICON_SET.indexOf(sub.icon) >= 0 ? sub.icon : 'gear'),
      x: clamp(position.x, 0, 320), y: clamp(position.y, 0, 180), hidden: value === null};
  });
  var signals = [];
  (Array.isArray(state.signals) ? state.signals : []).forEach(function(sig){
    if (!sig || Array.isArray(sig) || typeof sig.from !== 'string' || typeof sig.to !== 'string') return;
    var from = byId[sig.from], to = byId[sig.to];
    if (from && to) signals.push({from: sig.from, to: sig.to,
      fromXY: {x: from.x, y: from.y}, toXY: {x: to.x, y: to.y}});
  });
  return {outline: {x: ox, y: oy, w: w, h: h}, devices: devices, subjects: subjects, signals: signals};
}

/* Room lighting is a view of the authored scene, not a simulated sensor or
   containment rule. The highest visible device state wins, then occupancy. */
function homemapRoomModel(panel, model){
  return homemapRooms(panel).map(function(room){
    function inside(item){
      var house = model.outline;
      if (room.kind === 'outdoor' && item.x > house.x && item.x < house.x + house.w &&
          item.y > house.y && item.y < house.y + house.h) return false;
      return item.x >= room.x && item.y >= room.y &&
        (item.x < room.x + room.w || (item.x === 320 && room.x + room.w === 320)) &&
        (item.y < room.y + room.h || (item.y === 180 && room.y + room.h === 180));
    }
    var devices = model.devices.filter(inside);
    var occupied = model.subjects.some(function(s){ return !s.hidden && inside(s); });
    var tone = devices.some(function(d){ return d.state === 'alert' || d.state === 'detect'; }) ? 'alert' :
      devices.some(function(d){ return d.state === 'warn'; }) ? 'warn' : occupied ? 'occupied' : 'quiet';
    return {room:room, tone:tone};
  });
}

function homemapThermalHTML(d, scaleY, clearing){
  var thermal = clearing || d.thermal;
  if (!thermal || thermal === 'normal') return '';
  var cold = thermal === 'cold' || thermal === 'freezing';
  var s = '<g class="hmthermal thermal-' + thermal + (clearing ? ' thermal-clearing' : '') +
    '" data-home-thermal="' + esc(d.id) + '" data-thermal="' + esc(d.thermal) + '" transform="translate(' + d.x + ' ' + (d.y * scaleY) + ')">' +
    '<title>' + esc(d.label + ': ' + (clearing ? 'temperature returning to normal' : thermal)) + '</title>' +
    '<circle class="thermal-halo" r="20"/><circle class="thermal-rim" r="12"/>';
  if (cold){
    for (var i = 0; i < 6; i++) s += '<path class="thermal-frost" transform="rotate(' + (i * 60) + ')" d="M0 -11 V-19 M-3 -16 L0 -13 L3 -16"/>';
    s += '<g class="thermal-badge" transform="translate(17 -17)"><circle r="7"/><path d="M0 -4 V4 M-3.5 -2 L3.5 2 M-3.5 2 L3.5 -2"/></g>';
  } else {
    [-8,0,8].forEach(function(x,i){ s += '<path class="thermal-wave" style="animation-delay:-' + (i * .65) + 's" d="M' + x + ' -13 C' + (x-5) + ' -18 ' + (x+5) + ' -21 ' + x + ' -27"/>'; });
    s += '<g class="thermal-badge" transform="translate(17 -17)"><circle r="7"/><use href="#i-thermo" x="-5" y="-5" width="10" height="10"/></g>';
  }
  return s + '</g>';
}
function homemapDoorHTML(d, transition, outline, clearing){
  var w = d.doorWidth, angle = d.doorSwing * Math.PI / 180;
  var endX = (w * Math.cos(angle)).toFixed(3), endY = (w * Math.sin(angle)).toFixed(3);
  var body = '<g class="hmdev hm-entry hm-' + esc(d.state) + ' hm-floor-door" data-device="' + esc(d.id) + '">' +
    '<title>' + esc(d.label) + ': ' + esc(d.state) + '</title>' + homemapThermalHTML(d, HOMEMAP_Y_SCALE, clearing) +
    '<g transform="translate(' + d.x + ' ' + (d.y * HOMEMAP_Y_SCALE) + ') scale(1 ' + HOMEMAP_Y_SCALE + ') rotate(' + d.facing + ')">' +
    '<path class="hm-door-threshold" d="M-1 0 H' + (w + 1) + '"/>' +
    '<path class="hm-door-hit" d="M0 0 H' + w + ' M' + w + ' 0 A' + w + ' ' + w + ' 0 0 ' + (d.doorSwing > 0 ? 1 : 0) + ' ' + endX + ' ' + endY + '"/>' +
    '<path class="hm-door-arc" d="M' + w + ' 0 A' + w + ' ' + w + ' 0 0 ' + (d.doorSwing > 0 ? 1 : 0) + ' ' + endX + ' ' + endY + '"/>' +
    '<g class="hm-floor-leaf' + (transition ? ' hm-floor-' + transition : '') + '" style="--hm-door-angle:' + d.doorSwing + 'deg">' +
    '<path d="M0 0 H' + w + '"/><circle class="hm-door-handle" cx="' + (w - 4) + '" cy="-2" r="1"/></g>' +
    '<path class="hm-door-jamb" d="M0 -3 V3 M' + w + ' -3 V3"/><circle class="hm-door-hinge" r="1.8"/></g>';
  var labelX = d.x, labelY = d.y > 139 ? d.y * HOMEMAP_Y_SCALE - 14 : d.y * HOMEMAP_Y_SCALE + 16;
  var direction = d.facing * Math.PI / 180;
  if (outline && Math.abs(Math.cos(direction)) > .7){
    labelX += w * Math.cos(direction) / 2;
    labelY = (d.y + w * Math.sin(direction) / 2) * HOMEMAP_Y_SCALE + (d.y < outline.y + outline.h / 2 ? -14 : 14);
  }
  return body + '<text class="hmlbl" x="' + clamp(labelX, 28, 292) + '" y="' + clamp(labelY, 10, HOMEMAP_DISPLAY_HEIGHT - 5) + '" text-anchor="middle">' + esc(d.label) + '</text></g>';
}

function radarModel(panel, state){
  panel = panel || {}; state = state || {};
  function fin(v){ return typeof v === 'number' && isFinite(v) ? v : null; }
  var sensor = (panel.sensor && fin(panel.sensor.x) != null && fin(panel.sensor.y) != null)
    ? {x: panel.sensor.x, y: panel.sensor.y} : {x: 160, y: 168};
  var facing = fin(panel.facing) != null ? panel.facing : 270;
  var spread = fin(panel.spread) != null ? clamp(panel.spread, 10, 360) : 120;
  /* POLAR AUTHORING LAYER: with `scale: {pxPerUnit, unit}` declared, authors
     write real units everywhere — `range`, `threshold`, and a `rings` ARRAY
     are unit distances; a zone may be an annular sector {r:[r0,r1],
     deg:[d0,d1]}; a subject may be {r, deg} (degrees in the same clockwise-
     from-+x convention). Everything converts to frame pixels HERE; the rest
     of the model and the renderer stay Cartesian. Without `scale`, all
     numbers are frame pixels and subjects/zones are Cartesian, as before. */
  var ppu = (panel.scale && fin(panel.scale.pxPerUnit) != null && panel.scale.pxPerUnit > 0)
    ? panel.scale.pxPerUnit : null;
  var toPx = function(v){ return ppu != null ? v * ppu : v; };
  var fromPolar = function(r, deg){
    var a = deg * Math.PI / 180;
    return {x: sensor.x + toPx(r) * Math.cos(a), y: sensor.y + toPx(r) * Math.sin(a)};
  };
  var range = fin(panel.range) != null && panel.range > 0 ? toPx(panel.range) : 150;
  var ringRadii = null, rings = 3;
  if (Array.isArray(panel.rings)){
    ringRadii = panel.rings.map(fin).filter(function(v){ return v != null && v > 0; })
      .map(toPx).filter(function(v){ return v <= range + 0.5; })
      .map(function(v){ return Math.round(v * 10) / 10; });
    rings = ringRadii.length || 3;
    if (!ringRadii.length) ringRadii = null;
  } else if (fin(panel.rings) != null){
    rings = Math.round(clamp(panel.rings, 1, 6));
  }
  var threshold = fin(panel.threshold) != null && panel.threshold > 0
    ? Math.min(toPx(panel.threshold), range) : null;
  /* a step may re-tune the alert line: state.threshold (same units as the
     declaration) overrides it for that step onward via normal folding */
  if (fin(state.threshold) != null && state.threshold > 0)
    threshold = Math.min(toPx(state.threshold), range);
  var zones = (Array.isArray(panel.zones) ? panel.zones : []).map(function(z){
    z = z || {};
    var pts = Array.isArray(z.points) ? z.points : [];
    /* annular sector → sampled polygon (inner arc out, outer arc back) */
    if (!pts.length && Array.isArray(z.r) && z.r.length === 2 &&
        Array.isArray(z.deg) && z.deg.length === 2 &&
        fin(z.r[0]) != null && fin(z.r[1]) != null && z.r[0] >= 0 && z.r[1] > z.r[0] &&
        fin(z.deg[0]) != null && fin(z.deg[1]) != null){
      /* wrapped sectors take the natural short way round ([350,10] spans 20°,
         not 340°); sampling adapts to the span (≈15° chords) so wide sectors
         keep the arc tight enough for correct point-in-polygon occupancy */
      /* span is the clockwise travel from d0 to d1, normalized into (0,360]:
         [350,10] → 20°, and a full-turn writing ([0,360], [360,0], [10,-350])
         → 360°. Only literally equal endpoints are degenerate (skipped; the
         validator warns). */
      var d0 = z.deg[0], d1 = z.deg[1];
      var span = ((d1 - d0) % 360 + 360) % 360;
      if (span === 0){
        if (d0 === d1) return {id: z.id, label: z.label || z.id || '', points: []};
        span = 360;
      }
      var N = Math.max(6, Math.ceil(span / 15));
      pts = [];
      for (var zi = 0; zi <= N; zi++){
        var p1 = fromPolar(z.r[0], d0 + span * zi / N);
        pts.push([p1.x, p1.y]);
      }
      for (var zj = N; zj >= 0; zj--){
        var p2 = fromPolar(z.r[1], d0 + span * zj / N);
        pts.push([p2.x, p2.y]);
      }
      pts = pts.map(function(p){ return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; });
    }
    /* numeric-only points: author data goes straight into SVG attributes, so
       anything non-finite is dropped here (attribute injection impossible) */
    pts = pts.filter(function(p){
      return Array.isArray(p) && fin(p[0]) != null && fin(p[1]) != null;
    }).map(function(p){ return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; });
    return {id: z.id, label: z.label || z.id || '', points: pts};
  }).filter(function(z){ return z.id && z.points.length >= 3; });
  var subj = null;
  if (state.subject && fin(state.subject.x) != null && fin(state.subject.y) != null)
    subj = {x: state.subject.x, y: state.subject.y};
  else if (state.subject && fin(state.subject.r) != null && fin(state.subject.deg) != null){
    var sp = fromPolar(state.subject.r, state.subject.deg);
    subj = {x: Math.round(sp.x * 10) / 10, y: Math.round(sp.y * 10) / 10};
  }
  var dist = null, alert = false, occupied = [];
  if (subj){
    var dx = subj.x - sensor.x, dy = subj.y - sensor.y;
    dist = Math.sqrt(dx * dx + dy * dy);
    if (threshold != null && dist <= threshold) alert = true;
    zones.forEach(function(z){
      if (pointInPoly(subj.x, subj.y, z.points)) occupied.push(z.id);
    });
  }
  if (state.alert === true) alert = true;
  if (state.alert === false) alert = false;
  return {sensor: sensor, facing: facing, spread: spread, range: range,
          rings: rings, ringRadii: ringRadii, threshold: threshold, zones: zones,
          subject: subj, dist: dist, alert: alert, occupied: occupied,
          banner: state.banner != null ? String(state.banner) : '',
          status: state.status != null ? String(state.status) : null};
}

/* buffer widget: a segmented buffer strip — pre-roll rings, store-and-forward
   queues, storage rotation. Pure model (node-testable). The author declares
   the segment count once and patches a `cells` array of state tokens per step
   (REPLACES wholesale, like zones); missing tail cells are `empty`, unknown
   tokens fall back to `empty` (validator warns). `head` marks the write
   position. The footer summary (counts per state) is COMPUTED. */
var BUFFER_CELL_STATES = ['empty','buffered','protected','uploading','uploaded','dropped'];
function bufferModel(panel, state){
  panel = panel || {}; state = state || {};
  var n = (typeof panel.segments === 'number' && isFinite(panel.segments))
    ? Math.round(clamp(panel.segments, 2, 48)) : 12;
  /* mark: cumulative inclusive range paints [[i0,i1,"state"],...] applied
     over the cells base in order (shared bufferPaint helper — the fold
     compactor uses the same function, so a compacted story renders
     identically to an uncompacted one). */
  var cells = bufferPaint(n, state.cells, state.mark);
  var head = (typeof state.head === 'number' && isFinite(state.head) &&
              state.head >= 0 && state.head < n) ? Math.round(state.head) : null;
  var counts = {};
  cells.forEach(function(c){ counts[c] = (counts[c] || 0) + 1; });
  var parts = [];
  BUFFER_CELL_STATES.forEach(function(sname){
    if (sname !== 'empty' && counts[sname]) parts.push(counts[sname] + ' ' + sname);
  });
  return {n: n, cells: cells, head: head, counts: counts,
          capacity: panel.capacity != null ? String(panel.capacity) : '',
          note: state.note != null ? String(state.note)
                : (state.label != null ? String(state.label) : ''),
          summary: parts.length ? parts.join(' · ') : 'empty'};
}

/* inflight widget: operations/messages as bars on one shared step axis.
   foldInflightStates (validator.js) supplies complete history snapshots;
   this pure model vets that snapshot for the HTML renderer. */
/* timeline: wall-clock axis over a declared span with periodic cadence
   beats and event dots; steps sweep a `now` cursor and append events.
   Pure model (node-testable, no DOM). */
function timelineLabelRows(events){
  /* deterministic label collision layout: labels go on row 0, overflow
     to row 1, and drop to hover-title-only (labelRow null) when both
     rows are occupied at that x. Widths are estimated from the 8.5px
     mono glyphs; x positions mirror the renderer's clamp. */
  var charW = 5.1;
  var ends = [-Infinity, -Infinity];
  events.forEach(function(e){
    if (!e.label){ e.labelRow = null; return; }
    /* the estimate and the drawing must agree: long labels TRUNCATE to
       what the estimate measures (the hover title keeps the full text) */
    e.labelText = e.label.length > 22 ? e.label.slice(0, 21) + '\u2026' : e.label;
    var x = Math.min(Math.max(6 + e.pct / 100 * 308, 16), 304);
    var half = e.labelText.length * charW / 2;
    var xs = x - half, xe = x + half;
    if (xs >= ends[0] + 4){ e.labelRow = 0; ends[0] = xe; }
    else if (xs >= ends[1] + 4){ e.labelRow = 1; ends[1] = xe; }
    else e.labelRow = null;
  });
  return events;
}
/* cadence lanes: several periodic processes on ONE wall-clock axis,
   each lane rendered in a density REGIME chosen by its beat count over
   the span — individual dots, a true-spacing tick comb, a solid band,
   or an empty row with a "next in …" promise. The regime is the
   orders-of-magnitude contrast. Pure model. */
var TL_DOT_MAX = 32;   /* beats drawable as individual dots on the track */
var TL_COMB_MAX = 120; /* beats drawable as a legible tick comb */
function timelineLanesModel(panel, state){
  panel = panel || {}; state = state || {};
  var span = parseClock(panel.span);
  if (span == null || span <= 0) span = 3600;
  if (span > TIMELINE_MAX_SPAN) span = TIMELINE_MAX_SPAN;
  var units = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
  var unit = units[units.length - 1];
  for (var i = 0; i < units.length; i++){
    if (span / units[i] <= 8){ unit = units[i]; break; }
  }
  var ticks = [];
  for (var ts = 0; ts <= span + 1e-6 && ticks.length <= 12; ts += unit)
    ticks.push({s: ts, pct: ts / span * 100, label: formatClock(ts)});
  var nowS = parseClock(state.now);
  var now = null;
  if (nowS != null){
    var nc = Math.min(Math.max(nowS, 0), span);
    now = {s: nc, pct: nc / span * 100, label: formatClock(nc)};
  }
  function normList(list){
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function(e){
      if (!e) return;
      var at = parseClock(e.at);
      if (at == null) return;
      var s = Math.min(Math.max(at, 0), span);
      out.push({s: s, pct: s / span * 100,
                lane: e.lane != null ? String(e.lane) : null,
                label: e.label != null ? String(e.label) : '',
                kind: ['ok', 'alert', 'info'].indexOf(e.kind) >= 0 ? e.kind : 'info'});
    });
    return out;
  }
  var allEvents = normList(panel.events).concat(normList(state.events));
  var misses = normList(state.miss);
  var seen = Object.create(null);
  var lanes = [];
  ((Array.isArray(panel.lanes)) ? panel.lanes : []).forEach(function(l){
    if (lanes.length >= 4) return;
    if (!l || typeof l !== 'object' || l.id == null) return;
    var id = String(l.id);
    if (seen[id]) return;
    var every = parseClock(l.every);
    if (every == null || every <= 0) return;
    seen[id] = true;
    var count = Math.floor((span + 1e-6) / every);
    var regime = count < 1 ? 'sparse' : count <= TL_DOT_MAX ? 'dots' :
                 count <= TL_COMB_MAX ? 'comb' : 'band';
    var beats = [];
    if (regime === 'dots'){
      for (var b = every; b <= span + 1e-6; b += every)
        beats.push({s: b, pct: b / span * 100, past: !!(now && b <= now.s + 1e-6)});
    }
    var badge;
    if (regime === 'sparse'){
      if (now){
        var nextAt = (Math.floor((now.s + 1e-6) / every) + 1) * every;
        badge = 'next in ' + formatClock(nextAt - now.s) + ' \u25b8';
      } else badge = 'every ' + formatClock(every);
    } else badge = count + '\u00d7';
    lanes.push({id: id,
                label: l.label != null ? String(l.label) : id,
                every: every, everyLabel: formatClock(every),
                regime: regime, count: count, beats: beats,
                spacingPct: every / span * 100,
                badge: badge,
                misses: misses.filter(function(m){ return m.lane === id; }),
                events: allEvents.filter(function(e){ return e.lane === id; })});
  });
  return {span: span, spanLabel: formatClock(span), ticks: ticks, now: now,
          lanes: lanes,
          axisEvents: allEvents.filter(function(e){ return e.lane == null || !seen[e.lane]; })};
}

function timelineModel(panel, state){
  panel = panel || {}; state = state || {};
  var span = parseClock(panel.span);
  if (span == null || span <= 0) span = 3600;
  if (span > TIMELINE_MAX_SPAN) span = TIMELINE_MAX_SPAN; /* validator warns */
  /* tick unit: coarsest table entry giving at most 8 intervals; the top
     entry (1d) covers the clamped 7d maximum within the bound */
  var units = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
  var unit = units[units.length - 1];
  for (var i = 0; i < units.length; i++){
    if (span / units[i] <= 8){ unit = units[i]; break; }
  }
  var ticks = [];
  for (var ts = 0; ts <= span + 1e-6 && ticks.length <= 12; ts += unit)
    ticks.push({s: ts, pct: ts / span * 100, label: formatClock(ts)});
  var every = panel.cadence ? parseClock(panel.cadence.every) : null;
  var beats = [], beatsOmitted = 0;
  if (every != null && every > 0){
    var beatCount = Math.floor((span + 1e-6) / every);
    if (beatCount > TIMELINE_MAX_BEATS){
      /* sub-pixel soup — draw none, report the count instead of
         silently truncating the cadence */
      beatsOmitted = beatCount;
    } else {
      for (var b = every; b <= span + 1e-6; b += every)
        beats.push({s: b, pct: b / span * 100});
    }
  }
  function norm(list){
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function(e){
      if (!e) return;
      var at = parseClock(e.at);
      if (at == null) return;
      var s = Math.min(Math.max(at, 0), span);
      out.push({s: s, pct: s / span * 100,
                label: e.label != null ? String(e.label) : '',
                kind: ['ok', 'alert', 'info'].indexOf(e.kind) >= 0 ? e.kind : 'info'});
    });
    return out;
  }
  var events = norm(panel.events).concat(norm(state.events));
  events.sort(function(a, b){ return a.s - b.s; });
  timelineLabelRows(events);
  var nowS = parseClock(state.now);
  var now = null;
  if (nowS != null){
    var c = Math.min(Math.max(nowS, 0), span);
    now = {s: c, pct: c / span * 100, label: formatClock(c)};
  }
  /* detail window: the cadence interval containing `now`, magnified so
     events BETWEEN two long-running beats spread out legibly. Derived —
     no spec field. Absent without a cadence or a cursor. */
  var detail = null;
  if (every != null && every > 0 && now){
    var k = Math.floor((now.s + 1e-6) / every);
    var dStart = k * every;
    if (dStart >= span) dStart = Math.max(span - every, 0);
    var dEnd = Math.min(dStart + every, span);
    if (dEnd > dStart){
      var dLen = dEnd - dStart;
      var dEvents = [];
      events.forEach(function(e){
        if (e.s >= dStart - 1e-6 && e.s <= dEnd + 1e-6)
          dEvents.push({s: e.s, pct: (e.s - dStart) / dLen * 100, label: e.label, kind: e.kind});
      });
      timelineLabelRows(dEvents);
      var dUnits = [1, 5, 10, 30, 60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200];
      var dUnit = dUnits[dUnits.length - 1];
      for (var di = 0; di < dUnits.length; di++){
        if (dLen / dUnits[di] <= 6){ dUnit = dUnits[di]; break; }
      }
      var dTicks = [];
      for (var dts = Math.ceil((dStart + 1e-6) / dUnit) * dUnit;
           dts < dEnd - 1e-6 && dTicks.length <= 8; dts += dUnit)
        dTicks.push({s: dts, pct: (dts - dStart) / dLen * 100});
      detail = {start: dStart, end: dEnd,
                startLabel: formatClock(dStart), endLabel: formatClock(dEnd),
                startPct: dStart / span * 100, endPct: dEnd / span * 100,
                ticks: dTicks, events: dEvents,
                nowPct: Math.min(Math.max((now.s - dStart) / dLen * 100, 0), 100),
                startPast: now.s >= dStart - 1e-6, endPast: now.s >= dEnd - 1e-6};
    }
  }
  return {span: span, spanLabel: formatClock(span), unit: unit, ticks: ticks,
          beats: beats, beatsOmitted: beatsOmitted, every: every, events: events, now: now,
          detail: detail,
          cadenceLabel: panel.cadence && panel.cadence.label != null ? String(panel.cadence.label) : ''};
}

function inflightModel(panel, state, stepCount, currentStep){
  panel = panel || {}; state = state || {};
  var seen = {};
  var lanes = (Array.isArray(panel.lanes) ? panel.lanes : []).slice(0, 8).map(function(l){
    if (!l || !l.id || seen[l.id]) return null;
    seen[l.id] = true;
    return {id:String(l.id), label:l.label != null ? String(l.label) : String(l.id), bars:[]};
  }).filter(Boolean);
  var byId = {};
  lanes.forEach(function(l){ byId[l.id] = l; });
  var n = typeof stepCount === 'number' && isFinite(stepCount) ? Math.max(0, Math.round(stepCount)) :
          (typeof state.stepCount === 'number' ? Math.max(0, Math.round(state.stepCount)) : 0);
  var cur = typeof currentStep === 'number' && isFinite(currentStep) ? Math.round(currentStep) :
            (typeof state.currentStep === 'number' ? Math.round(state.currentStep) : 0);
  if (n) cur = clamp(cur, 0, n - 1); else cur = 0;
  (Array.isArray(state.bars) ? state.bars : []).forEach(function(b){
    if (!b || !byId[b.lane] || !validRevealIndex(b.start)) return;
    var end = validRevealIndex(b.end) ? b.end : null;
    var st = INFLIGHT_STATES.indexOf(b.state) >= 0 ? b.state : 'ok';
    byId[b.lane].bars.push({lane:b.lane, label:b.label != null ? String(b.label) : '',
      start:b.start, end:end, state:st, open:end == null});
  });
  return {lanes:lanes, stepCount:n, currentStep:cur};
}

function inflightPanelHTML(panel, state, stepCount, currentStep){
  var m = inflightModel(panel, state, stepCount, currentStep);
  if (!m.lanes.length) return '<div class="ifempty">no lanes</div>';
  var n = Math.max(1, m.stepCount);
  var h = '<div class="ifbox"><div class="ifaxis"><span class="ifaxislabel">step</span><span class="ifticks">';
  for (var i = 0; i < m.stepCount; i++){
    h += '<span class="iftick' + (i === m.currentStep ? ' cur' : '') + '" style="left:' +
         ((i + 0.5) / n * 100).toFixed(3) + '%">' + i + '</span>';
  }
  h += '</span></div>';
  m.lanes.forEach(function(lane){
    h += '<div class="ifrow"><span class="iflabel" title="' + esc(lane.label) + '">' + esc(lane.label) +
         '</span><span class="iftrack">';
    if (m.stepCount) h += '<i class="ifnow" style="left:' + (m.currentStep / n * 100).toFixed(3) +
      '%;width:' + (100 / n).toFixed(3) + '%"></i>';
    for (var gi = 1; gi < n; gi++) h += '<i class="ifgrid" style="left:' + (gi / n * 100).toFixed(3) + '%"></i>';
    lane.bars.forEach(function(bar){
      var last = bar.open ? m.currentStep : bar.end;
      last = Math.max(bar.start, Math.min(n - 1, last));
      var left = bar.start / n * 100;
      var width = (last - bar.start + 1) / n * 100;
      h += '<b class="ifbar s-' + bar.state + (bar.open ? ' open' : '') + '" style="left:' +
           left.toFixed(3) + '%;width:' + width.toFixed(3) + '%" title="' + esc(bar.label || lane.label) +
           ' · steps ' + bar.start + (bar.open ? '+' : '–' + bar.end) + '">' + esc(bar.label) + '</b>';
    });
    h += '</span></div>';
  });
  return h + '</div>';
}

/* Stable presentation keys and target widths for inflight bars. These frames
   are never folded back into state; they only let a rebuilt bar begin at its
   previous painted width during an adjacent transition. */
function inflightBarFrames(model){
  var frames = [], seen = {}, n = Math.max(1, model.stepCount);
  model.lanes.forEach(function(lane){
    lane.bars.forEach(function(bar){
      var base = lane.id + '\n' + bar.start + '\n' + bar.label;
      var ordinal = seen[base] || 0;
      seen[base] = ordinal + 1;
      var last = bar.open ? model.currentStep : bar.end;
      last = Math.max(bar.start, Math.min(n - 1, last));
      frames.push({key:base + '\n' + ordinal,
        width:(last - bar.start + 1) / n * 100});
    });
  });
  return frames;
}

/* phone widget: a generic handset lock screen backed by the absolute unread
   stack produced by foldPhoneStates. The model keeps the full count for the
   computed badge while exposing only the three cards that can fit. */
function phoneBrand(panel){
  var brand = panel && panel.brand;
  if (!phoneBrandIsPlainObject(brand)) return null;
  var out = {};
  if (typeof brand.app === 'string') out.app = brand.app;
  if (typeof brand.logo === 'string' && brand.logo.length >= 1 && brand.logo.length <= 4)
    out.logo = brand.logo;
  /* These values enter an inline style: accept only literal hex colors. */
  ['accent', 'bg', 'fg'].forEach(function(k){
    if (typeof brand[k] === 'string' && (brand[k].length === 4 || brand[k].length === 7) &&
        /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(brand[k]))
      out[k] = brand[k];
  });
  return Object.keys(out).length ? out : null;
}

function phoneModel(panelOrState, stepsOrState, currentStep){
  var state;
  /* Public fold form: phoneModel(panel, diagramSteps, targetIndex). This is
     useful to callers/tests that need the complete target state without
     first reaching through foldPanelStates. Omit targetIndex for the end. */
  if (Array.isArray(stepsOrState)){
    var folded = foldPhoneStates(panelOrState || {}, stepsOrState);
    var target = typeof currentStep === 'number' && isFinite(currentStep) ? Math.round(currentStep) : folded.length - 1;
    state = folded[clamp(target, 0, folded.length - 1)] || {};
  } else if (stepsOrState && typeof stepsOrState === 'object' && !Array.isArray(stepsOrState)){
    /* Conventional widget-model form: phoneModel(panel, absoluteState). */
    state = stepsOrState;
  } else {
    /* Compact renderer form: phoneModel(absoluteState). */
    state = panelOrState || {};
  }
  var notifications = (Array.isArray(state.notifications) ? state.notifications : []).map(function(n){
    if (!n || typeof n !== 'object' || Array.isArray(n) || typeof n.app !== 'string' || !n.app) return null;
    return {app:n.app,
      title:typeof n.title === 'string' ? n.title : '',
      text:typeof n.text === 'string' ? n.text : ''};
  }).filter(Boolean);
  return {
    clock:typeof state.clock === 'string' ? state.clock : '',
    notifications:notifications,
    cards:notifications.slice(0, 3),
    count:notifications.length,
    badge:notifications.length,
    overflow:Math.max(0, notifications.length - 3),
    added:typeof state._phoneAdded === 'number' ? Math.max(0, Math.round(state._phoneAdded)) : 0
  };
}

function phonePanelHTML(panel, state, fresh){
  panel = panel || {};
  var m = phoneModel(panel, state);
  var brand = phoneBrand(panel);
  var styles = [];
  if (brand){
    if (brand.accent) styles.push('--phacc:' + brand.accent);
    if (brand.bg) styles.push('--phbg:' + brand.bg);
    if (brand.fg) styles.push('--phfg:' + brand.fg);
  }
  var label = m.count ? 'Phone with ' + m.count + ' unread notification' + (m.count === 1 ? '' : 's') :
    'Phone with no notifications';
  if (brand && brand.app) label = brand.app + ' phone' + label.slice(5);
  var h = '<div class="phoneframe"' + (styles.length ? ' style="' + styles.join(';') + '"' : '') +
    ' role="img" aria-label="' + esc(label) + '">' +
    '<span class="phonespeaker" aria-hidden="true"></span>' +
    '<div class="phonestatus"><span class="phoneclock">' + esc(m.clock) + '</span>' +
    '<span class="phoneglyphs" aria-hidden="true"><span class="phonesignal"><i></i><i></i><i></i></span>' +
    '<span class="phonebattery"><i></i></span></span></div>';
  if (brand && (brand.app || brand.logo))
    h += '<div class="phonebrand">' +
      (brand.logo ? '<span class="phonelogo" aria-hidden="true">' + esc(brand.logo) + '</span>' : '') +
      (brand.app ? '<span class="phonebrandname">' + esc(brand.app) + '</span>' : '') + '</div>';
  if (m.count)
    h += '<span class="phonebadge" aria-hidden="true">' + m.badge + '</span>';
  h += '<div class="phonecards">';
  if (!m.cards.length){
    h += '<div class="phoneempty">no notifications</div>';
  } else {
    m.cards.forEach(function(card, i){
      h += '<div class="phonecard' + (fresh && i === 0 ? ' fresh' : '') + '">' +
        '<div class="phoneapp" title="' + esc(card.app) + '">' + esc(card.app) + '</div>' +
        (card.title ? '<div class="phonetitle" title="' + esc(card.title) + '">' + esc(card.title) + '</div>' : '') +
        (card.text ? '<div class="phonetext" title="' + esc(card.text) + '">' + esc(card.text) + '</div>' : '') +
        '</div>';
    });
  }
  h += '</div>';
  if (m.overflow) h += '<div class="phoneoverflow">+' + m.overflow + ' more</div>';
  return h + '<span class="phonehome" aria-hidden="true"></span></div>';
}

/* Camera-details UI with field-level provenance. Everything is authored data;
   even endpoint labels are inert text. Source selection is local viewer state. */
function deviceAppModel(panel,state){
  panel=panel || {};state=state || {};
  var str=function(v,fallback){return typeof v==='string'?v:(fallback || '');};
  var palette=['#5865d8','#168878','#bd6716','#a354b5','#287fbe','#b95164'];
  var sources=deviceAppItems(panel,'sources').map(function(s,i){return {
    id:s.id,label:str(s.label,s.id),letter:String.fromCharCode(65+i),
    color:typeof s.color==='string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.color)?s.color:palette[i],
    node:str(s.node),endpoint:str(s.endpoint),detail:str(s.detail)
  };});
  var fields=deviceAppItems(panel,'fields').map(function(f){
    var v=panelObject(state[f.id])?state[f.id]:{},battery=f.kind==='battery';
    var source=sources.find(function(s){return s.id===(v.source==null?f.source:v.source);});
    var valid=v.value!=null && (typeof v.value==='string' || isFiniteNum(v.value) || typeof v.value==='boolean');
    if(battery)valid=isFiniteNum(v.value) && v.value>=0 && v.value<=100;
    return {id:f.id,label:str(f.label,f.id),source:source || null,battery:battery,
      icon:ICON_SET.indexOf(f.icon)>=0?f.icon:null,value:valid?String(v.value)+(battery?'%':str(f.unit)): '—',
      pct:battery && valid?v.value:0,status:DEVICEAPP_STATUSES.indexOf(v.status)>=0?v.status:'unknown',
      detail:str(v.detail),updated:Array.isArray(state._updated) && state._updated.indexOf(f.id)>=0};
  });
  return {device:str(panel.device,'Camera'),subtitle:str(panel.subtitle,'Device health'),clock:str(state.clock,'9:41'),note:str(state.note),sources:sources,fields:fields};
}
function deviceAppPanelHTML(panel,state,fresh){
  var m=deviceAppModel(panel,state),labels={unknown:'No data',loading:'Loading',ready:'Current',stale:'Cached',error:'Unavailable'};
  function badge(s){return '<span class="da-badge" aria-hidden="true">'+(s?s.letter:'?')+'</span>';}
  function props(s){return ' data-da-source="'+esc(s?s.id:'')+'" style="--da-color:'+(s?s.color:'#78808d')+'"';}
  var h='<div class="deviceapp"><div class="da-phone"><div class="da-statusbar"><span>'+esc(m.clock)+'</span><span aria-hidden="true">▂▄▆ · ▰</span></div>'+
    '<div class="da-heading"><span class="da-eyebrow">CAMERA DETAILS</span><h3>'+esc(m.device)+'</h3><span>'+esc(m.subtitle)+'</span></div><div class="da-fields">';
  m.fields.forEach(function(f){
    h+='<button type="button" class="da-field da-'+f.status+(f.updated?' da-updated':'')+(fresh && f.updated?' fresh':'')+'" data-da-field="'+esc(f.id)+'"'+props(f.source)+' aria-pressed="false" aria-label="'+esc(f.label+': '+f.value+'. '+labels[f.status]+'. Source: '+(f.source?f.source.label:'Unmapped'))+'">'+
      '<span class="da-field-top"><span>'+esc(f.label)+'</span>'+badge(f.source)+'</span>'+
      '<span class="da-value">'+(f.icon?'<svg class="da-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-'+f.icon+'"/></svg>':'')+esc(f.value)+'</span>'+
      (f.battery?'<span class="da-meter" aria-hidden="true"><i style="width:'+f.pct+'%"></i></span>':'')+
      '<span class="da-meta"><span class="da-state">'+labels[f.status]+'</span>'+(f.updated?'<span class="da-update-label">Updated</span>':'')+'</span>'+
      (f.detail?'<span class="da-detail">'+esc(f.detail)+'</span>':'')+'</button>';
  });
  h+='</div><div class="da-home" aria-hidden="true"></div></div><div class="da-provenance"><div class="da-eyebrow">WHERE THE DATA COMES FROM</div>'+
    '<h3>One screen. Multiple sources.</h3><p class="da-help">Select a field or source to trace its data'+(m.sources.some(function(s){return s.node;})?' and highlight its service in the diagram':'')+'.</p><div class="da-sources">';
  m.sources.forEach(function(s){
    var fields=m.fields.filter(function(f){return f.source && f.source.id===s.id;});
    h+='<button type="button" class="da-source"'+props(s)+' aria-pressed="false"><span class="da-source-title">'+badge(s)+'<strong>'+esc(s.label)+'</strong></span>'+
      (s.endpoint?'<code>'+esc(s.endpoint)+'</code>':'')+(s.detail?'<span class="da-detail">'+esc(s.detail)+'</span>':'')+
      '<span class="da-source-fields">'+esc(fields.length?fields.map(function(f){return f.label+' · '+labels[f.status];}).join(' / '):'No fields in this step')+'</span></button>';
  });
  return h+'</div>'+(m.note?'<p class="da-note">'+esc(m.note)+'</p>':'')+'</div></div>';
}
function bindDeviceAppSources(host,panel,state){
  if(typeof host.querySelectorAll!=='function')return;
  if(host._daClear)host._daClear();
  var nodes=[],m=deviceAppModel(panel,state);
  var buttons=Array.from(host.querySelectorAll('[data-da-source]'));
  function clearNodes(){nodes.forEach(function(n){if(n._daOwners){n._daOwners.delete(host);if(!n._daOwners.size)n.classList.remove('da-node-focus');}});nodes=[];}
  host._daClear=clearNodes;
  function select(id){
    clearNodes();host._daSource=id;
    buttons.forEach(function(b){var on=!!id && b.getAttribute('data-da-source')===id;b.setAttribute('aria-pressed',String(on));});
    var source=m.sources.find(function(s){return s.id===id;});
    var section=host.closest && host.closest('.doc-sec');
    if(section && source && source.node)Array.from(section.querySelectorAll('[data-dv-node]')).forEach(function(n){
      if(n.getAttribute('data-dv-node')!==source.node)return;
      if(!n._daOwners)n._daOwners=new Set();n._daOwners.add(host);n.classList.add('da-node-focus');nodes.push(n);
    });
  }
  buttons.forEach(function(b){b.addEventListener('click',function(){var id=b.getAttribute('data-da-source');select(host._daSource===id?null:id);});});
  select(host._daSource);
}

/* queue widget: mailbox — a message enqueued, held, dequeued. Pure model +
   markup builder so node tests cover them without a DOM. Directional context:
   `from` shows during enqueue (arrival side), `to` during dequeue (departure
   side), `reason` while held (the waiting-on line). Carried like any patch
   field; only the state-relevant one renders. Non-strings are ignored (the
   validator warns). */
function queueModel(state){
  state = state || {};
  var s = QUEUE_STATES.indexOf(String(state.state)) >= 0 ? String(state.state) : 'empty';
  function str(v){ return typeof v === 'string' ? v : ''; }
  return {state: s, label: state.label != null ? String(state.label) : '',
          from: str(state.from), to: str(state.to), reason: str(state.reason)};
}

function queuePanelHTML(panel, state){
  var qm = queueModel(state);
  var h = '<div class="qbox s-' + qm.state + '">';
  h += '<div class="qtrack">';
  h += '<span class="qarr qarr-in" aria-hidden="true">&#8594;</span>';
  h += '<div class="qslot">';
  if (qm.state === 'empty') h += '<span class="qempty">empty</span>';
  else h += '<span class="qmsg">' + esc(qm.label || 'message') + '</span>';
  h += '</div>';
  h += '<span class="qarr qarr-out" aria-hidden="true">&#8594;</span>';
  h += '</div>';
  /* directional context row: arrival label on the in-side during enqueue,
     departure label on the out-side during dequeue. Both spans are ALWAYS
     emitted (populated only in the relevant state) so the row reserves a
     fixed height and the panel never changes size between steps — otherwise
     the panel column and the step bar below it reflow. Static text, so it is
     reduced-motion safe. */
  var ctxIn = (qm.state === 'enqueue') ? esc(qm.from) : '';
  var ctxOut = (qm.state === 'dequeue') ? esc(qm.to) : '';
  h += '<div class="qctx"><span class="qside qside-in">' + ctxIn + '</span>' +
       '<span class="qside qside-out">' + ctxOut + '</span></div>';
  h += '<div class="qstatecap">' + qm.state + '</div>';
  /* waiting-on line, shown while held; container always emitted (empty
     otherwise) and clamped to a fixed height so its length cannot reflow. */
  var reason = (qm.state === 'held') ? esc(qm.reason) : '';
  h += '<div class="qreason">' + reason + '</div>';
  h += '</div>';
  return h;
}

/* inline markup: a small, safe subset for prose. The whole string is ESCAPED
   FIRST, then a fixed set of substitutions is applied, so labels/URLs are
   always HTML-safe and only http/https links are ever emitted (never
   javascript:/data:). Supported:
     [label](https://url)  ->  underlined anchor
     **bold**              ->  <strong>
     *italic*              ->  <em>   (single star; snake_case is untouched
                                       because italics use * not _)
     `code`                ->  <code>
   Plain prose with none of these is simply escaped, so this is a drop-in
   replacement for esc() in prose contexts. */
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

var ZF_SEQ = 0;

/* ---------------- software state panels ---------------- */
function replicaModel(panel,state){
  state = panelObject(state) ? state : {};
  var ref = replicaCursor(state.reference), unit = replicaSeries(panel.unit) || 'positions';
  var rows = replicaPanelItems(panel).map(function(r){
    var s = panelOwn(state.replicas,r.id) && panelObject(state.replicas[r.id]) ? state.replicas[r.id] : {};
    var cur = replicaCursor(s), delta = ref && cur && ref.series === cur.series ? cur.position-ref.position : null;
    return {id:r.id, label:typeof r.label === 'string' ? r.label : r.id,
      position:replicaPosition(s.position), series:replicaSeries(s.series),
      role:typeof s.role === 'string' ? s.role : '', observedAt:typeof s.observedAt === 'string' ? s.observedAt : '',
      status:REPLICA_STATUSES.indexOf(s.status) >= 0 ? s.status : 'unknown',
      lagMs:isFiniteNum(s.lagMs) && s.lagMs >= 0 ? s.lagMs : null,
      delta:delta, comparison:delta !== null ? (delta === 0 ? 'equal' : delta < 0 ? 'behind' : 'ahead') :
        !cur ? 'unknown' : !ref ? 'no-reference' : 'different-series'};
  });
  var comparable = rows.filter(function(r){ return r.delta !== null; });
  var positions = comparable.map(function(r){ return r.position; });
  if (ref) positions.push(ref.position);
  var min = positions.length ? Math.min.apply(null,positions) : null;
  var max = positions.length ? Math.max.apply(null,positions) : null;
  function pct(value){ return min === max ? 50 : (value-min)/(max-min)*100; }
  rows.forEach(function(r){ r.pct = r.delta !== null ? pct(r.position) : null; });
  return {reference:ref, rows:rows, comparable:comparable.length, min:min, max:max,
    referencePct:ref ? pct(ref.position) : null, unit:unit, note:typeof state.note === 'string' ? state.note : ''};
}
function replicaPanelHTML(panel,state){
  var m = replicaModel(panel,state), ref = m.reference;
  var h = '<div class="replicas-view"><div class="rep-reference"><b>'+
    (ref ? 'Reference '+esc(String(ref.position))+' '+esc(m.unit) : 'Reference unavailable')+'</b>'+
    (ref ? '<div>Sequence: '+esc(ref.series)+'</div>' : '<div>A position and sequence identity are required.</div>')+'</div>';
  if (ref) h += '<div class="rep-scale">Position window: '+esc(String(m.min))+' – '+esc(String(m.max))+
    ' '+esc(m.unit)+' · dashed marker = reference</div>';
  h += '<div class="rep-list" tabindex="0" role="region" aria-label="Replica observations">';
  m.rows.forEach(function(r){
    var comparison = r.comparison === 'equal' ? 'At reference' : r.delta !== null ? Math.abs(r.delta)+' '+m.unit+' '+r.comparison :
      r.comparison === 'different-series' ? 'Different sequence · not compared' : r.comparison === 'no-reference' ? 'No reference · not compared' : 'Position or sequence unknown';
    h += '<div class="rep-row"><div class="rep-head"><b>'+esc(r.label)+'</b><span class="rep-status">'+esc(r.status)+'</span></div>'+
      (r.role ? '<div class="rep-role">'+esc(r.role)+'</div>' : '')+
      '<div class="rep-value">Position '+(r.position === null ? 'unknown' : esc(String(r.position)))+'</div>'+
      '<div class="rep-series">Sequence: '+(r.series === null ? 'unknown' : esc(r.series))+'</div>'+
      '<div class="rep-track" aria-hidden="true">'+(ref ? '<i class="rep-reference-mark" style="left:'+m.referencePct+'%"></i>' : '')+
      (r.pct !== null ? '<i class="rep-position-mark" style="left:'+r.pct+'%"></i>' : '')+'</div>'+
      '<div class="rep-comparison">'+esc(comparison)+'</div><div class="rep-lag">Reported lag: '+
      (r.lagMs === null ? 'unknown' : esc(String(r.lagMs))+' ms')+'</div><div class="rep-observed">Observed: '+
      (r.observedAt ? esc(r.observedAt) : 'time unknown')+'</div></div>';
  });
  if (!m.rows.length) h += '<div class="swempty">No replicas declared</div>';
  h += '</div><p class="rep-note">'+m.comparable+' / '+m.rows.length+' positions comparable. Position equality does not prove availability, commit, or read safety. Lag is supplied separately; it is not a catch-up estimate.</p>';
  if (m.note) h += '<p class="rep-note">'+esc(m.note)+'</p>';
  return h+'</div>';
}
function tableModel(panel, state){
  state = state || {};
  var columns = softwarePanelItems(panel), seen = Object.create(null);
  var rows = (Array.isArray(state.rows) ? state.rows : []).slice(0, 12).filter(function(row){
    if (!panelObject(row) || typeof row.id !== 'string' || !row.id || seen[row.id]) return false;
    seen[row.id] = true;
    return true;
  }).map(function(row){
    return {id: row.id, status: TABLE_STATUSES.indexOf(row.status) >= 0 ? row.status : 'neutral',
      cells: columns.map(function(col){
        if (!panelOwn(row.cells, col.id)) return '—';
        var v = row.cells[col.id];
        if (v === null) return 'null';
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
      })};
  });
  return {columns: columns, rows: rows};
}
function checksModel(panel, state){
  state = state || {};
  return softwarePanelItems(panel).map(function(check){
    var result = panelOwn(state.results, check.id) && panelObject(state.results[check.id])
      ? state.results[check.id] : {};
    return {id: check.id, label: check.label || check.id,
      status: CHECK_STATUSES.indexOf(result.status) >= 0 ? result.status : 'pending',
      detail: result.detail == null ? '' : String(result.detail)};
  });
}
function budgetModel(panel, state){
  state = state || {};
  return softwarePanelItems(panel).map(function(metric){
    var raw = panelOwn(state.values, metric.id) ? state.values[metric.id] : null;
    var value = isFiniteNum(raw) && raw >= 0 ? raw : null;
    var max = isFiniteNum(metric.max) && metric.max > 0 ? metric.max : null;
    var warn = max !== null && isFiniteNum(metric.warn) && metric.warn >= 0 && metric.warn <= max ? metric.warn : null;
    var status = value === null ? 'unknown' : max === null ? 'unbounded' :
      value > max ? 'over' : value === max ? 'limit' : warn !== null && value >= warn ? 'warn' : 'ok';
    return {id: metric.id, label: metric.label || metric.id, unit: metric.unit || '',
      value: value, max: max, warn: warn, status: status,
      pct: value !== null && max !== null ? Math.min(value / max, 1) * 100 : 0,
      remaining: value !== null && max !== null ? max - value : null};
  });
}
function softwarePanelHTML(panel, state){
  state = state || {};
  var h = '<div class="swpanel">';
  if (panel.type === 'table'){
    var table = tableModel(panel, state);
    h += '<div class="swtablewrap" tabindex="0" role="region" aria-label="' + esc(panel.title || 'Data state') + '">' +
      '<table class="swtable"><caption class="swcaption">' + esc(panel.title || 'Data state') + '</caption><thead><tr>';
    table.columns.forEach(function(col){ h += '<th scope="col">' + esc(col.label || col.id) + '</th>'; });
    h += '<th scope="col">Change</th></tr></thead><tbody>';
    table.rows.forEach(function(row){
      h += '<tr class="swrow-' + row.status + '">';
      row.cells.forEach(function(cell){ h += '<td>' + esc(cell) + '</td>'; });
      h += '<td><span class="swbadge sw-' + row.status + '">' +
        (row.status === 'neutral' ? '—' : row.status) + '</span></td></tr>';
    });
    if (!table.rows.length) h += '<tr><td colspan="' + (table.columns.length + 1) + '" class="swempty">No rows at this step</td></tr>';
    h += '</tbody></table></div>';
  } else if (panel.type === 'checks'){
    var checks = checksModel(panel, state), passed = checks.filter(function(c){ return c.status === 'pass'; }).length;
    h += '<div class="swsummary">' + passed + ' / ' + checks.length + ' passed <span>Authored outcomes</span></div><ul class="swchecks">';
    checks.forEach(function(check){
      h += '<li><div class="swcheckhead"><span>' + esc(check.label) + '</span>' +
        '<span class="swbadge sw-' + check.status + '">' + check.status + '</span></div>' +
        (check.detail ? '<div class="swdetail">' + esc(check.detail) + '</div>' : '') + '</li>';
    });
    h += '</ul>';
    if (!checks.length) h += '<div class="swempty">No checks declared</div>';
  } else if (panel.type === 'budget'){
    var metrics = budgetModel(panel, state);
    var labels = {unknown:'NO DATA', unbounded:'NO LIMIT', over:'OVER LIMIT', limit:'AT LIMIT', warn:'NEAR LIMIT', ok:'WITHIN LIMIT'};
    metrics.forEach(function(metric){
      var tone = metric.status === 'over' ? 'fail' : ['warn','limit'].indexOf(metric.status) >= 0 ? 'warn' :
        metric.status === 'ok' ? 'pass' : 'pending';
      h += '<div class="swmetric"><div class="swcheckhead"><span>' + esc(metric.label) + '</span>' +
        '<span class="swbadge sw-' + tone + '">' + labels[metric.status] + '</span></div>' +
        '<div class="swmeasure"><strong>' + (metric.value === null ? '—' : esc(String(metric.value))) + '</strong>' +
        ' / ' + (metric.max === null ? '—' : esc(String(metric.max))) + ' ' + esc(metric.unit) + '</div>';
      if (metric.value !== null && metric.max !== null){
        h += '<div class="swtrack" role="img" aria-label="' + esc(metric.label + ': ' + metric.value + ' of ' + metric.max + ' ' + metric.unit + ', ' + labels[metric.status]) + '">' +
          '<div class="swfill sw-' + tone + '" style="width:' + metric.pct.toFixed(2) + '%"></div>';
        if (metric.warn !== null) h += '<span class="swthreshold" style="left:' + (metric.warn / metric.max * 100).toFixed(2) + '%" title="Warning at ' + esc(String(metric.warn)) + '"></span>';
        h += '</div><div class="swdetail">' + esc(String(Number(Math.abs(metric.remaining).toPrecision(6)))) +
          ' ' + esc(metric.unit) + (metric.remaining < 0 ? ' over budget' : ' remaining') + '</div>';
      }
      h += '</div>';
    });
    if (!metrics.length) h += '<div class="swempty">No budgets declared</div>';
  }
  if (state.note) h += '<div class="swnote">' + esc(String(state.note)) + '</div>';
  return h + '</div>';
}

/* ---------------- inspector panel widgets ----------------
   Each widget renders ABSOLUTE state (from foldPanelStates) — no deltas, so
   any step jump is consistent. renderPanelBody rebuilds the widget's DOM.
   `states`/`stepIdx` (optional) are the panel's FULL folded per-step state
   array and the current index — the thermo sparkline plots the whole series
   and reveals it up to the current step. */
function renderPanelBody(host, panel, state, skin, states, stepIdx, animatePresentation){
  var type = PANEL_TYPES.indexOf(panel.type) >= 0 ? panel.type : null;
  var h = '';
  /* All panel motion consumes an already-folded target state. The previous
     DOM/value is used only as a visual starting point and never feeds state. */
  var animate = animatePresentation !== false && !RM;
  var pulseSelector = null, pulseChanged = false;
  var waterfallEntrants = null;
  var inflightFramesNow = null, inflightFramesPrev = null;
  /* when a branch emits one-shot transient markup (pir's fresh/ghost/trail/
     ripple/glide), it sets hBaseline to the steady-state form of the SAME
     render; that is what gets stored for the unchanged-markup comparison so
     the following identical step skips the rebuild */
  var hBaseline = null;
  state = state || {};
  if (type === 'trace'){
    h = tracePanelHTML(panel,state,states);
  } else if (type === 'replicas'){
    h = replicaPanelHTML(panel,state);
  } else if (['table','checks','budget'].indexOf(type) >= 0){
    h = softwarePanelHTML(panel, state);
  } else if (type === 'image'){
    var imageSrc = embeddedImageSource(panel.src);
    h = '<figure class="pimage">';
    if (imageSrc) h += '<img src="' + esc(imageSrc) + '" alt="' + esc(panel.alt || '') + '" decoding="async">';
    else h += '<div class="pimage-empty">Add an embedded PNG, JPEG or WebP image</div>';
    if (panel.caption) h += '<figcaption>' + esc(panel.caption) + '</figcaption>';
    var imageLink = typeof FlowCanon !== 'undefined' && FlowCanon.http(panel.link);
    if (imageLink) h += '<a class="pimage-link" href="' + esc(imageLink) + '" target="_blank" rel="noopener noreferrer">Open reference ↗</a>';
    h += '</figure>';
  } else if (type === 'state'){
    var cur = state.state != null ? String(state.state) : '—';
    pulseSelector = '.pchip.cur';
    pulseChanged = Object.prototype.hasOwnProperty.call(host, '_stateCur') && host._stateCur !== cur;
    host._stateCur = cur;
    var colors = panel.colors || {};
    var col = isHex(colors[cur]) ? colors[cur] : null;
    h += '<div class="preadout"' + (col ? ' style="color:' + col + '"' : '') + '>' + esc(cur) + '</div>';
    h += '<div class="prail">';
    (panel.states || []).forEach(function(st){
      h += '<span class="pchip' + (st === cur ? ' cur' : '') + '">' + esc(st) + '</span>';
    });
    h += '</div>';
  } else if (type === 'leds'){
    h += '<div class="ledrow">';
    (panel.leds || []).forEach(function(l){
      var mode = String(state[l.id] || 'off');
      if (['on','off','tx','rx'].indexOf(mode) < 0) mode = 'off';
      h += '<span class="led"><span class="leddot ' + mode + '"></span>' + esc(l.label || l.id) + '</span>';
    });
    h += '</div>';
  } else if (type === 'gauge'){
    var v = typeof state.value === 'number' ? state.value : 0;
    var max = typeof panel.max === 'number' && panel.max > 0 ? panel.max : 100;
    var pct = clamp(v / max * 100, 0, 100);
    h += '<div class="gaugeval">' + esc(String(v)) + (panel.unit ? ' <span class="gaugeunit">' + esc(panel.unit) + '</span>' : '') + '</div>';
    h += '<div class="gaugebar"><div class="gaugefill" style="width:' + pct.toFixed(1) + '%"></div></div>';
  } else if (type === 'thermo'){
    var tm = thermoModel(panel, state);
    var idx = typeof stepIdx === 'number' ? stepIdx : 0;
    var tv = tm.value != null ? String(Math.round(tm.value * 10) / 10) : null;
    h += '<div class="thhead"><div class="thval z-' + tm.zone + '">' +
         (tv != null ? esc(tv) : '&#8212;') + '<span class="thunit">' + esc(tm.unit) + '</span></div>' +
         '<span class="thzone z-' + tm.zone + '">' + esc(tm.label) + '</span></div>';
    /* threshold track: shaded warn/crit bands under the value fill, threshold
       ticks over it, numeric scale beneath */
    h += '<div class="thbar">';
    if (tm.lowWarnPct != null || tm.lowCritPct != null){
      var safeStart = tm.lowWarnPct != null ? tm.lowWarnPct : tm.lowCritPct;
      var safeEnd = tm.warnPct != null ? tm.warnPct : tm.critPct != null ? tm.critPct : 100;
      h += '<span class="thband safe" style="left:' + safeStart.toFixed(1) + '%;width:' + (safeEnd-safeStart).toFixed(1) + '%"></span>';
    }
    if (tm.lowWarnPct != null) h += '<span class="thband cold-warn" style="left:' + (tm.lowCritPct || 0).toFixed(1) + '%;width:' + (tm.lowWarnPct-(tm.lowCritPct || 0)).toFixed(1) + '%"></span>';
    if (tm.lowCritPct != null) h += '<span class="thband cold-crit" style="left:0;width:' + tm.lowCritPct.toFixed(1) + '%"></span>';
    if (tm.warnPct != null)
      h += '<span class="thband warn" style="left:' + tm.warnPct.toFixed(1) + '%;width:' +
           ((tm.critPct != null ? tm.critPct : 100) - tm.warnPct).toFixed(1) + '%"></span>';
    if (tm.critPct != null)
      h += '<span class="thband crit" style="left:' + tm.critPct.toFixed(1) + '%;width:' +
           (100 - tm.critPct).toFixed(1) + '%"></span>';
    if (tm.value != null)
      h += '<span class="thfill z-' + tm.zone + '" style="width:' + tm.pct.toFixed(1) + '%"></span>';
    if (tm.warnPct != null) h += '<span class="thtick warn" style="left:' + tm.warnPct.toFixed(1) + '%"></span>';
    if (tm.critPct != null) h += '<span class="thtick crit" style="left:' + tm.critPct.toFixed(1) + '%"></span>';
    ['lowWarn','lowCrit'].forEach(function(key){
      if (tm[key] != null) h += '<span class="thtick ' + (key === 'lowWarn' ? 'cold-warn' : 'cold-crit') + '" style="left:' + tm[key+'Pct'].toFixed(1) + '%" title="' + (key === 'lowWarn' ? 'Cold warning' : 'Cold critical') + ': ' + esc(String(tm[key]) + tm.unit) + '"></span>';
    });
    h += '</div>';
    h += '<div class="thscale"><span class="lo">' + esc(String(tm.min)) + '</span>';
    if (tm.warn != null) h += '<span class="warn" style="left:' + tm.warnPct.toFixed(1) + '%">' + esc(String(tm.warn)) + '</span>';
    if (tm.crit != null) h += '<span class="crit" style="left:' + tm.critPct.toFixed(1) + '%">' + esc(String(tm.crit)) + '</span>';
    ['lowWarn','lowCrit'].forEach(function(key){
      if (tm[key] != null) h += '<span class="' + (key === 'lowWarn' ? 'cold-warn' : 'cold-crit') + '" style="left:' + tm[key+'Pct'].toFixed(1) + '%">' + esc(String(tm[key])) + '</span>';
    });
    h += '<span class="hi">' + esc(String(tm.max)) + '</span></div>';
    if (tm.lowWarn != null || tm.lowCrit != null) h += '<div class="thrange-key"><span>Cold limits</span><span>Safe interval</span><span>' + (tm.warn != null || tm.crit != null ? 'Hot limits' : '') + '</span></div>';
    /* step-history sparkline: every step's value plots as a faint frame (dots
       + ghost line) so the axis is stable; the bright line and dots reveal
       only up to the current step, so stepping tells the thermal story and a
       jump to any step re-renders consistently */
    /* same finite-only rule as thermoModel: an Infinity value renders as
       NO DATA in the readout, so it must not plot as a history point either */
    var hist = Array.isArray(states) ? states.map(function(s){
      return s && typeof s.value === 'number' && isFinite(s.value) ? s.value : null;
    }) : [];
    if (hist.length > 1){
      var sX = function(i){ return 6 + 248 * i / (hist.length - 1); };
      var sY = function(vv){ return 54 - clamp((vv - tm.min) / (tm.max - tm.min), 0, 1) * 46; };
      h += '<svg class="thspark" viewBox="0 0 260 62" role="img" aria-label="temperature per step">';
      ['lowWarn','lowCrit'].forEach(function(key){
        if (tm[key] != null) h += '<line class="thguide ' + (key === 'lowWarn' ? 'cold-warn' : 'cold-crit') + '" x1="6" x2="254" y1="' + sY(tm[key]).toFixed(1) + '" y2="' + sY(tm[key]).toFixed(1) + '"/>';
      });
      if (tm.warn != null)
        h += '<line class="thguide warn" x1="6" x2="254" y1="' + sY(tm.warn).toFixed(1) + '" y2="' + sY(tm.warn).toFixed(1) + '"/>';
      if (tm.crit != null)
        h += '<line class="thguide crit" x1="6" x2="254" y1="' + sY(tm.crit).toFixed(1) + '" y2="' + sY(tm.crit).toFixed(1) + '"/>';
      /* a null slot (step with no finite value) BREAKS the line: segments are
         emitted per run of consecutive finite values, so the line never
         bridges a no-data step */
      var ghostSegs = [], litSegs = [], gSeg = null, lSeg = null;
      hist.forEach(function(vv, i){
        if (vv == null){ gSeg = null; lSeg = null; return; }
        var pt = sX(i).toFixed(1) + ',' + sY(vv).toFixed(1);
        if (!gSeg){ gSeg = []; ghostSegs.push(gSeg); }
        gSeg.push(pt);
        if (i <= idx){
          if (!lSeg){ lSeg = []; litSegs.push(lSeg); }
          lSeg.push(pt);
        } else lSeg = null;
      });
      ghostSegs.forEach(function(seg){
        if (seg.length > 1) h += '<polyline class="thline ghost" points="' + seg.join(' ') + '"/>';
      });
      litSegs.forEach(function(seg){
        if (seg.length > 1) h += '<polyline class="thline" points="' + seg.join(' ') + '"/>';
      });
      hist.forEach(function(vv, i){
        if (vv == null) return;
        var zc = thermoModel(panel, {value: vv}).zone;
        var isCur = i === idx;
        h += '<circle class="thdot z-' + zc + (i <= idx ? ' on' : '') + (isCur ? ' cur' : '') +
             '" cx="' + sX(i).toFixed(1) + '" cy="' + sY(vv).toFixed(1) + '" r="' + (isCur ? 4 : 2.4) + '"/>';
      });
      h += '</svg>';
    }
  } else if (type === 'battery'){
    var bm = batteryModel(panel, state);
    var bidx = typeof stepIdx === 'number' ? stepIdx : 0;
    var bv = bm.charge != null ? String(Math.round(bm.charge)) : null;
    h += '<div class="bthead"><div class="btval z-' + bm.zone + '">' +
         (bv != null ? esc(bv) : '&#8212;') + '<span class="btunit">%</span>' +
         (bm.trend === 'charging' ? '<span class="btbolt" aria-label="charging">&#9889;</span>' : '') +
         (bm.cold ? '<span class="btcold" aria-label="cold-limited">&#10052;</span>' : '') +
         '</div><span class="btzone z-' + bm.zone + '">' + esc(bm.label) + '</span></div>';
    /* battery glyph: shell + terminal nub + zone-colored fill; low/crit
       threshold ticks on the shell like thermo's bands */
    h += '<div class="btglyph"><div class="btshell">';
    if (bm.charge != null)
      h += '<span class="btfill z-' + bm.zone + '" style="width:' + bm.charge.toFixed(1) + '%"></span>';
    if (bm.low != null) h += '<span class="bttick low" style="left:' + bm.low.toFixed(1) + '%"></span>';
    if (bm.crit != null) h += '<span class="bttick crit" style="left:' + bm.crit.toFixed(1) + '%"></span>';
    h += '</div><span class="btnub"></span></div>';
    /* context row: power source badge + trend word + forecast note; all
       containers always emitted so the panel height is constant */
    h += '<div class="btctx"><span class="btsrc">' + (bm.source ? esc(bm.source.toUpperCase()) : '') + '</span>' +
         '<span class="bttrend">' + (bm.trend ? esc(bm.trend) : '') + '</span>' +
         '<span class="btnote">' + esc(bm.note) + '</span></div>';
    /* step-history sparkline, same reveal semantics as thermo: every step's
       folded charge plots faintly, bright up to the current step, gaps break
       the line */
    var bhist = Array.isArray(states) ? states.map(function(s){
      return s && typeof s.charge === 'number' && isFinite(s.charge) ? clamp(s.charge, 0, 100) : null;
    }) : [];
    if (bhist.length > 1){
      var bX = function(i){ return 6 + 248 * i / (bhist.length - 1); };
      var bY = function(vv){ return 54 - (vv / 100) * 46; };
      h += '<svg class="btspark" viewBox="0 0 260 62" role="img" aria-label="charge per step">';
      if (bm.low != null)
        h += '<line class="btguide low" x1="6" x2="254" y1="' + bY(bm.low).toFixed(1) + '" y2="' + bY(bm.low).toFixed(1) + '"/>';
      if (bm.crit != null)
        h += '<line class="btguide crit" x1="6" x2="254" y1="' + bY(bm.crit).toFixed(1) + '" y2="' + bY(bm.crit).toFixed(1) + '"/>';
      var bGhost = [], bLit = [], bg = null, bl = null;
      bhist.forEach(function(vv, i){
        if (vv == null){ bg = null; bl = null; return; }
        var pt = bX(i).toFixed(1) + ',' + bY(vv).toFixed(1);
        if (!bg){ bg = []; bGhost.push(bg); }
        bg.push(pt);
        if (i <= bidx){
          if (!bl){ bl = []; bLit.push(bl); }
          bl.push(pt);
        } else bl = null;
      });
      bGhost.forEach(function(seg){
        if (seg.length > 1) h += '<polyline class="btline ghost" points="' + seg.join(' ') + '"/>';
      });
      bLit.forEach(function(seg){
        if (seg.length > 1) h += '<polyline class="btline" points="' + seg.join(' ') + '"/>';
      });
      bhist.forEach(function(vv, i){
        if (vv == null) return;
        var bz = batteryModel(panel, {charge: vv}).zone;
        var bCur = i === bidx;
        h += '<circle class="btdot z-' + bz + (i <= bidx ? ' on' : '') + (bCur ? ' cur' : '') +
             '" cx="' + bX(i).toFixed(1) + '" cy="' + bY(vv).toFixed(1) + '" r="' + (bCur ? 4 : 2.4) + '"/>';
      });
      h += '</svg>';
    }
  } else if (type === 'buffer'){
    var bfm = bufferModel(panel, state);
    /* head row: one marker slot per cell so the ▼ sits over the write head */
    h += '<div class="bfhead">';
    for (var bh = 0; bh < bfm.n; bh++)
      h += '<span class="bfmark' + (bfm.head === bh ? ' on' : '') + '">' + (bfm.head === bh ? '&#9660;' : '') + '</span>';
    h += '</div>';
    h += '<div class="bfrow">';
    bfm.cells.forEach(function(c){ h += '<span class="bfcell s-' + c + '"></span>'; });
    h += '</div>';
    h += '<div class="bffoot"><span class="bfsum">' + esc(bfm.summary) + '</span>' +
         (bfm.capacity ? '<span class="bfcap">' + esc(bfm.capacity) + '</span>' : '') + '</div>';
    /* note line always emitted (fixed height — never reflows the column) */
    h += '<div class="bfnote">' + esc(bfm.note) + '</div>';
  } else if (type === 'log'){
    var tags = panel.tags || {};
    h += '<div class="plog">';
    (state.log || []).forEach(function(line){
      var tag = line && line.tag ? String(line.tag) : '';
      var col2 = isHex(tags[tag]) ? tags[tag] : null;
      h += '<div class="plogline">' +
           (tag ? '<span class="plogtag"' + (col2 ? ' style="color:' + col2 + '"' : '') + '>' + esc(tag) + '</span>' : '') +
           '<span>' + esc(line && line.text != null ? line.text : String(line)) + '</span></div>';
    });
    h += '</div>';
  } else if (type === 'screen'){
    var mode = String(state.mode || 'off');
    if (SCREEN_MODES.indexOf(mode) < 0) mode = 'off';
    var sceneName = SCENE_NAMES.indexOf(panel.scene) >= 0 ? panel.scene : 'static-noise';
    var scrClass = 'screenbox m-' + mode +
      (state.scenePlayback === 'waiting' && ['active','live','rec','save'].indexOf(mode) >= 0 ? ' scene-waiting' : '');
    /* overlays are built separately from the scene so a mode change between
       two scene-showing modes can swap ONLY the overlays (surgical path
       below) and keep the scene subtree's animation state (the walker) */
    var scrOvl = '';
    if (mode === 'active') scrOvl += '<span class="ovl activechip">ACTIVE</span>';
    if (mode === 'live') scrOvl += '<span class="ovl livechip">LIVE</span>';
    if (mode === 'rec') scrOvl += '<span class="ovl recchip"><span class="recdot"></span>REC</span>';
    if (mode === 'save') scrOvl += '<span class="ovl banner">' + esc(state.banner || 'SAVING CLIP') + '</span>';
    if (mode === 'off') scrOvl += '<span class="ovl offlabel">STANDBY</span>';
    if (mode === 'unavailable') scrOvl += '<div class="ovl screen-unavailable" role="status">' +
      '<svg viewBox="0 0 40 32" aria-hidden="true"><rect x="6" y="9" width="24" height="17" rx="4"/><path d="M12 9 L15 5 H23 L26 9 M3 3 L36 30"/><circle cx="18" cy="17" r="5"/></svg>' +
      '<strong>Camera unavailable</strong><span>' + esc(typeof state.reason === 'string' && state.reason.trim() ? state.reason : 'Video is temporarily unavailable.') + '</span></div>';
    h += '<div class="' + scrClass + '">';
    if (mode === 'boot') h += SCENES['static-noise'];
    else if (mode === 'active' || mode === 'live' || mode === 'rec' || mode === 'save') h += SCENES[sceneName];
    h += scrOvl + '</div>';
  } else if (type === 'timeline' && Array.isArray(panel.lanes) && panel.lanes.length){
    var lnm = timelineLanesModel(panel, state);
    var LX0 = 70, LX1 = 252, LW = LX1 - LX0;   /* track range; labels left, badges right */
    function lx(pct){ return (LX0 + pct / 100 * LW).toFixed(1); }
    var rowsTop = 22, rowH = 18;
    var rowsBottom = rowsTop + lnm.lanes.length * rowH;
    var tlH = rowsBottom + 14;
    h += '<svg class="tlsvg" viewBox="0 0 320 ' + tlH + '" role="img" aria-label="cadence lanes">';
    /* shared axis strip on top */
    h += '<line class="tlaxis" x1="' + LX0 + '" y1="12" x2="' + LX1 + '" y2="12"/>';
    lnm.ticks.forEach(function(tk){
      h += '<line class="tltickline" x1="' + lx(tk.pct) + '" y1="8" x2="' + lx(tk.pct) + '" y2="16"/>';
    });
    lnm.axisEvents.forEach(function(ev){
      h += '<circle class="tlev tl-' + ev.kind + '" cx="' + lx(ev.pct) + '" cy="12" r="2.6"><title>' +
           esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) + '</title></circle>';
    });
    /* lane rows */
    lnm.lanes.forEach(function(ln, li){
      var cy = rowsTop + li * rowH + 9;
      var labText = ln.label.length > 13 ? ln.label.slice(0, 12) + '\u2026' : ln.label;
      h += '<text class="tllane" x="2" y="' + (cy + 3) + '">' + esc(labText) +
           '<title>' + esc(ln.label + ' — every ' + ln.everyLabel) + '</title></text>';
      h += '<line class="tlrowline" x1="' + LX0 + '" y1="' + cy + '" x2="' + LX1 + '" y2="' + cy + '"/>';
      var splitX = lnm.now ? parseFloat(lx(lnm.now.pct)) : LX0;
      if (ln.regime === 'dots'){
        ln.beats.forEach(function(bt){
          h += '<circle class="tlbeat' + (bt.past ? ' past' : '') + '" cx="' + lx(bt.pct) + '" cy="' + cy + '" r="2.6"/>';
        });
      } else if (ln.regime === 'comb'){
        var spacing = ln.spacingPct / 100 * LW;
        var pid = 'tlp' + (++ZF_SEQ);
        h += '<defs><pattern id="' + pid + '" x="' + LX0 + '" width="' + spacing.toFixed(3) +
             '" height="' + rowH + '" patternUnits="userSpaceOnUse">' +
             '<line class="tlcombline" x1="' + spacing.toFixed(3) + '" y1="3" x2="' + spacing.toFixed(3) + '" y2="15"/></pattern></defs>';
        if (splitX > LX0)
          h += '<rect class="tlpast" x="' + LX0 + '" y="' + (cy - 9) + '" width="' + (splitX - LX0).toFixed(1) +
               '" height="' + rowH + '" fill="url(#' + pid + ')"/>';
        if (splitX < LX1)
          h += '<rect class="tlfuture" x="' + splitX.toFixed(1) + '" y="' + (cy - 9) + '" width="' + (LX1 - splitX).toFixed(1) +
               '" height="' + rowH + '" fill="url(#' + pid + ')"/>';
      } else if (ln.regime === 'band'){
        if (splitX > LX0)
          h += '<rect class="tlbandfill tlpast" x="' + LX0 + '" y="' + (cy - 4) + '" width="' + (splitX - LX0).toFixed(1) + '" height="8" rx="2"/>';
        if (splitX < LX1)
          h += '<rect class="tlbandfill tlfuture" x="' + splitX.toFixed(1) + '" y="' + (cy - 4) + '" width="' + (LX1 - splitX).toFixed(1) + '" height="8" rx="2"/>';
      }
      /* sparse: the badge carries the promise; nothing on the track */
      ln.misses.forEach(function(m){
        if (ln.regime === 'dots'){
          h += '<circle class="tlmissring" cx="' + lx(m.pct) + '" cy="' + cy + '" r="4"><title>' +
               esc('missed — expected ' + formatClock(m.s)) + '</title></circle>';
        } else {
          h += '<line class="tlmiss" x1="' + lx(m.pct) + '" y1="' + (cy - 8) + '" x2="' + lx(m.pct) + '" y2="' + (cy + 8) + '"><title>' +
               esc('missed — expected ' + formatClock(m.s)) + '</title></line>';
        }
      });
      ln.events.forEach(function(ev){
        h += '<circle class="tlev tl-' + ev.kind + '" cx="' + lx(ev.pct) + '" cy="' + cy + '" r="3"><title>' +
             esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) + '</title></circle>';
      });
      h += '<text class="tlbadge" x="318" y="' + (cy + 3) + '" text-anchor="end">' + esc(ln.badge) + '</text>';
    });
    /* the now cursor runs through the axis and every row */
    if (lnm.now){
      var lnx = lx(lnm.now.pct);
      h += '<line class="tlnow" x1="' + lnx + '" y1="6" x2="' + lnx + '" y2="' + rowsBottom + '"/>' +
           '<circle class="tlnowhead" cx="' + lnx + '" cy="6" r="3"/>';
    }
    /* tick labels under the rows */
    lnm.ticks.forEach(function(tk){
      h += '<text class="tltick" x="' + lx(tk.pct) + '" y="' + (rowsBottom + 10) + '" text-anchor="middle">' + esc(tk.label) + '</text>';
    });
    h += '</svg>';
    var lmeta = [];
    if (lnm.now) lmeta.push('now ' + lnm.now.label);
    lmeta.push('span ' + lnm.spanLabel);
    h += '<div class="tlmeta">' + esc(lmeta.join(' \u00b7 ')) + '</div>';
  } else if (type === 'timeline'){
    var tlm = timelineModel(panel, state);
    function tlx(pct){ return (6 + pct / 100 * 308).toFixed(1); }
    if (tlm.detail){
      /* overview strip on top, the CURRENT cadence interval magnified
         below — events between two long-running beats spread out there */
      var dm = tlm.detail;
      h += '<svg class="tlsvg" viewBox="0 0 320 100" role="img" aria-label="timeline">';
      /* overview strip */
      if (tlm.now)
        h += '<rect class="tlelapsed" x="6" y="9" width="' + (tlm.now.pct / 100 * 308).toFixed(1) + '" height="6" rx="2"/>';
      h += '<rect class="tlband" x="' + tlx(dm.startPct) + '" y="3" width="' +
           ((dm.endPct - dm.startPct) / 100 * 308).toFixed(1) + '" height="18"/>';
      h += '<line class="tlaxis" x1="6" y1="12" x2="314" y2="12"/>';
      tlm.ticks.forEach(function(tk){
        h += '<line class="tltickline" x1="' + tlx(tk.pct) + '" y1="9" x2="' + tlx(tk.pct) + '" y2="15"/>';
      });
      tlm.beats.forEach(function(bt){
        var past = tlm.now && bt.s <= tlm.now.s + 1e-6;
        h += '<circle class="tlbeat' + (past ? ' past' : '') + '" cx="' + tlx(bt.pct) + '" cy="12" r="2.2"/>';
      });
      tlm.events.forEach(function(ev){
        h += '<circle class="tlev tl-' + ev.kind + '" cx="' + tlx(ev.pct) + '" cy="12" r="1.7"/>';
      });
      if (tlm.now){
        var onx = tlx(tlm.now.pct);
        h += '<line class="tlnow" x1="' + onx + '" y1="4" x2="' + onx + '" y2="20"/>';
      }
      /* zoom connectors from the band to the detail axis */
      h += '<line class="tlzoom" x1="' + tlx(dm.startPct) + '" y1="21" x2="6" y2="46"/>' +
           '<line class="tlzoom" x1="' + tlx(dm.endPct) + '" y1="21" x2="314" y2="46"/>';
      /* detail: one interval, beat to beat */
      h += '<line class="tlaxis" x1="6" y1="68" x2="314" y2="68"/>';
      dm.ticks.forEach(function(tk){
        h += '<line class="tltickline" x1="' + tlx(tk.pct) + '" y1="64" x2="' + tlx(tk.pct) + '" y2="72"/>';
      });
      h += '<circle class="tlbeat' + (dm.startPast ? ' past' : '') + '" cx="6" cy="68" r="4.2"/>' +
           '<circle class="tlbeat' + (dm.endPast ? ' past' : '') + '" cx="314" cy="68" r="4.2"/>' +
           '<text class="tltick" x="6" y="84" text-anchor="start">' + esc(dm.startLabel) + '</text>' +
           '<text class="tltick" x="314" y="84" text-anchor="end">' + esc(dm.endLabel) + '</text>';
      dm.events.forEach(function(ev){
        var x = tlx(ev.pct);
        h += '<circle class="tlev tl-' + ev.kind + '" cx="' + x + '" cy="54" r="4"><title>' +
             esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) + '</title></circle>';
        if (ev.label && ev.labelRow != null)
          h += '<text class="tlevlab" x="' + Math.min(Math.max(parseFloat(x), 16), 304) +
               '" y="' + (ev.labelRow === 0 ? 43 : 32) + '" text-anchor="middle">' + esc(ev.labelText || ev.label) + '</text>';
      });
      var dnx = tlx(dm.nowPct);
      h += '<line class="tlnow" x1="' + dnx + '" y1="47" x2="' + dnx + '" y2="74"/>' +
           '<circle class="tlnowhead" cx="' + dnx + '" cy="47" r="3"/>';
      h += '</svg>';
    } else {
      h += '<svg class="tlsvg" viewBox="0 0 320 64" role="img" aria-label="timeline">';
      if (tlm.now)
        h += '<rect class="tlelapsed" x="6" y="36" width="' + (tlm.now.pct / 100 * 308).toFixed(1) + '" height="8" rx="2"/>';
      h += '<line class="tlaxis" x1="6" y1="40" x2="314" y2="40"/>';
      tlm.ticks.forEach(function(tk){
        var x = tlx(tk.pct);
        h += '<line class="tltickline" x1="' + x + '" y1="36" x2="' + x + '" y2="44"/>' +
             '<text class="tltick" x="' + x + '" y="56" text-anchor="middle">' + esc(tk.label) + '</text>';
      });
      tlm.beats.forEach(function(bt){
        var past = tlm.now && bt.s <= tlm.now.s + 1e-6;
        h += '<circle class="tlbeat' + (past ? ' past' : '') + '" cx="' + tlx(bt.pct) + '" cy="40" r="2.6"/>';
      });
      tlm.events.forEach(function(ev){
        var x = tlx(ev.pct);
        h += '<circle class="tlev tl-' + ev.kind + '" cx="' + x + '" cy="26" r="4"><title>' +
             esc(formatClock(ev.s) + (ev.label ? ' — ' + ev.label : '')) + '</title></circle>';
        if (ev.label && ev.labelRow != null)
          h += '<text class="tlevlab" x="' + Math.min(Math.max(parseFloat(x), 16), 304) +
               '" y="' + (ev.labelRow === 0 ? 15 : 6) + '" text-anchor="middle">' + esc(ev.labelText || ev.label) + '</text>';
      });
      if (tlm.now){
        var nx = tlx(tlm.now.pct);
        h += '<line class="tlnow" x1="' + nx + '" y1="18" x2="' + nx + '" y2="46"/>' +
             '<circle class="tlnowhead" cx="' + nx + '" cy="18" r="3"/>';
      }
      h += '</svg>';
    }
    var tlmeta = [];
    if (tlm.every != null && tlm.every > 0){
      var cad = (tlm.cadenceLabel || 'beat') + ' every ' + formatClock(tlm.every);
      if (tlm.beatsOmitted) cad += ' (' + tlm.beatsOmitted + ' beats — too dense to draw)';
      tlmeta.push(cad);
    }
    if (tlm.detail) tlmeta.push('window ' + tlm.detail.startLabel + '\u2013' + tlm.detail.endLabel);
    if (tlm.now) tlmeta.push('now ' + tlm.now.label);
    tlmeta.push('span ' + tlm.spanLabel);
    h += '<div class="tlmeta">' + esc(tlmeta.join(' · ')) + '</div>';
  } else if (type === 'waterfall'){
    var wm = waterfallModel(panel.spans, state);
    var wfPrev = host._wfRevealed || null;
    var wfNow = wm.rows.map(function(r){ return r.revealed; });
    waterfallEntrants = wfPrev ? wfNow.map(function(on, i){ return on && !wfPrev[i]; }) : null;
    host._wfRevealed = wfNow;
    h += '<div class="wfall' + (wm.timed ? ' wf-timed' : '') + '">';
    wm.rows.forEach(function(r){
      h += '<div class="wfrow' + (r.revealed ? ' on' : '') + (r.highlight ? ' hl' : '') + (r.error ? ' wf-error' : '') +
           '" title="' + esc(r.label + ' · start +' + r.startMs + ' ms · duration ' + r.ms + ' ms' + (r.error ? ' · recorded error' : '')) + '">' +
           '<span class="wflabel">' + esc(r.label) + '</span>' +
           '<span class="wftrack"><span class="wfbar" style="margin-left:' + r.offsetPct.toFixed(2) +
           '%;width:' + Math.max(r.widthPct, wm.timed ? 0 : 1.2).toFixed(2) + '%"></span></span>' +
           '<span class="wfms">' + (r.revealed ? (r.error ? '! ' : '') + esc(String(r.ms)) + ' ms' : '&#8212;') + '</span></div>';
    });
    h += '<div class="wftotal">' + (wm.timed ? 'elapsed extent ' : 'total ') + '<b>' + esc(wm.totalLabel) + '</b></div></div>';
  } else if (type === 'orbit'){
    var ostates = Array.isArray(panel.states) ? panel.states : [];
    var ocur = state.state != null ? String(state.state) : null;
    pulseSelector = '.odot.cur';
    pulseChanged = Object.prototype.hasOwnProperty.call(host, '_orbitCur') && host._orbitCur !== ocur;
    host._orbitCur = ocur;
    var ocolors = panel.colors || {};
    var opos = orbitPositions(ostates.length, 110, 78, 54);
    h += '<svg class="orbit" viewBox="0 0 220 156" role="img" aria-label="' + esc(panel.title || 'state machine') + '">';
    h += '<circle class="oring" cx="110" cy="78" r="54"/>';
    ostates.forEach(function(sname, i){
      var p = opos[i];
      var isCur = String(sname) === ocur;
      var col = isHex(ocolors[sname]) ? ocolors[sname] : null;
      var anchor = p.x < 100 ? 'end' : (p.x > 120 ? 'start' : 'middle');
      var lx = p.x + (anchor === 'end' ? -11 : (anchor === 'start' ? 11 : 0));
      var ly = anchor === 'middle' ? (p.y < 78 ? p.y - 10 : p.y + 16) : p.y + 3.5;
      h += '<circle class="odot' + (isCur ? ' cur' : '') + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
           '" r="' + (isCur ? 7 : 4.5) + '"' + (isCur && col ? ' style="fill:' + col + '"' : '') + '/>';
      h += '<text class="olbl' + (isCur ? ' cur' : '') + '" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) +
           '" text-anchor="' + anchor + '">' + esc(String(sname)) + '</text>';
    });
    h += '<text class="ocur" x="110" y="75" text-anchor="middle"' +
         (ocur && isHex(ocolors[ocur]) ? ' style="fill:' + ocolors[ocur] + '"' : '') + '>' + esc(ocur || '—') + '</text>';
    if (state.via) h += '<text class="ovia" x="110" y="91" text-anchor="middle">via ' + esc(String(state.via)) + '</text>';
    h += '</svg>';
  } else if (type === 'zoneframe'){
    var zm = zoneModel(panel.zones, state.zones);
    /* pattern id is per-HOST, not per-render: a fresh id every render would
       make otherwise-identical markup unequal and defeat the unchanged-skip */
    var hid = host._zfId || (host._zfId = 'zfh' + (++ZF_SEQ));
    h += '<div class="zfbox"><svg class="zframe" viewBox="0 0 320 180" role="img" aria-label="' + esc(panel.title || 'camera zones') + '">';
    h += '<defs><pattern id="' + hid + '" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
         '<line x1="0" y1="0" x2="0" y2="8" stroke="#94A3B8" stroke-width="2" opacity=".5"/></pattern></defs>';
    h += '<rect width="320" height="180" fill="#0A0F14"/><rect y="150" width="320" height="30" fill="#131A21"/>';
    h += '<rect x="118" y="28" width="84" height="124" rx="3" fill="#10161D" stroke="#26313C" stroke-width="2"/>';
    zm.forEach(function(z){
      var pts = z.points.map(function(p){ return p[0] + ',' + p[1]; }).join(' ');
      h += '<polygon class="zone ' + z.state + '" points="' + pts + '"' +
           (z.state === 'masked' ? ' fill="url(#' + hid + ')"' : '') + '/>';
      if (z.points.length)
        h += '<text class="zlbl" x="' + (z.points[0][0] + 5) + '" y="' + (z.points[0][1] + 13) + '">' + esc(z.label) + '</text>';
    });
    if (state.subject && typeof state.subject.x === 'number' && typeof state.subject.y === 'number')
      h += '<circle class="zsubject" cx="' + state.subject.x + '" cy="' + state.subject.y + '" r="6"/>';
    var ZVERDICTS = {alert: 'ALERT SENT', suppress: 'IGNORED — OUTSIDE ARMED ZONES',
                     'never-captured': 'MASKED — PIXELS NEVER CAPTURED'};
    if (ZVERDICTS[state.verdict]){
      h += '<rect class="zverbg ' + state.verdict + '" x="0" y="0" width="320" height="22"/>' +
           '<text class="zvertext" x="8" y="15">' + ZVERDICTS[state.verdict] + '</text>';
    }
    h += '</svg></div>';
  } else if (type === 'pir'){
    var pm = pirModel(panel, state);
    var trip = pm.tripped ? 'tripped' : 'clear';
    /* one-shot cues (cone flash, subject ripple, status blink) fire only on a
       clear→tripped transition, not on every re-render while tripped and not
       on a first render that starts tripped (host._pirTrip === false means
       the PREVIOUS render was explicitly clear; undefined means no previous
       render). The previous render's tripped/subject live on the host. */
    var pirFresh = animate && pm.tripped && host._pirTrip === false;
    var pirPrev = host._pirPrev || null;
    var pirMoved = animate && pirPrev && pm.subject &&
                   (pirPrev.x !== pm.subject.x || pirPrev.y !== pm.subject.y);
    host._pirTrip = pm.tripped;
    host._pirPrev = pm.subject ? {x: pm.subject.x, y: pm.subject.y} : null;
    /* the widget markup is built twice: once WITH the one-shot transients
       (fresh classes, ghost, trail, ripple, glide offset) for the DOM, and
       once WITHOUT them as the comparison baseline (hBaseline) — the step
       AFTER a trip or a move produces exactly the steady form, so it matches
       the baseline and skips the rebuild instead of restarting the ambient
       sweep/ping animations. */
    var buildPir = function(transient){
      var s = '<div class="pirbox"><svg class="pirframe" viewBox="0 0 320 180" role="img" aria-label="' + esc(panel.title || 'IR sensor line of sight') + '">';
      s += '<rect width="320" height="180" class="pirbg"/><rect y="150" width="320" height="30" class="pirground"/>';
      if (pm.path)
        s += '<path class="pirpath" d="M' + pm.path.map(function(p){ return p[0] + ' ' + p[1]; }).join(' L') + '"/>';
      s += '<polygon class="pircone ' + trip + (transient && pirFresh ? ' fresh' : '') + '" points="' + cpts + '"/>';
      /* scanning beam sweeping the cone + detection pings from the sensor —
         ambient life while the step is parked; suppressed under reduced motion */
      if (!RM){
        var fr = pm.cone.facing * Math.PI / 180;
        var swx = pm.sensor.x + (pm.cone.range - 4) * Math.cos(fr);
        var swy = pm.sensor.y + (pm.cone.range - 4) * Math.sin(fr);
        s += '<g class="pirsweep ' + trip + '" style="transform-origin:' + pm.sensor.x + 'px ' + pm.sensor.y +
             'px;--sw:' + Math.max(0, pm.cone.spread / 2 - 3).toFixed(1) + 'deg">' +
             '<line x1="' + pm.sensor.x + '" y1="' + pm.sensor.y + '" x2="' + swx.toFixed(1) + '" y2="' + swy.toFixed(1) + '"/></g>';
        s += '<circle class="pirping" cx="' + pm.sensor.x + '" cy="' + pm.sensor.y + '" r="5"/>' +
             '<circle class="pirping p2" cx="' + pm.sensor.x + '" cy="' + pm.sensor.y + '" r="5"/>';
      }
      s += '<circle class="pirsensor" cx="' + pm.sensor.x + '" cy="' + pm.sensor.y + '" r="5"/>';
      s += '<text class="pirsensorlbl" x="' + (pm.sensor.x - 9) + '" y="' + (pm.sensor.y - 8) + '" text-anchor="end">IR</text>';
      if (pm.subject){
        /* between steps the subject glides from its previous position: it is
           rendered offset back to the old spot via an inline transform, which
           the post-render hook releases on the next frame (CSS transition).
           A fading ghost + dashed trail mark where it came from. */
        if (transient && pirMoved){
          s += '<line class="pirtrail" x1="' + pirPrev.x + '" y1="' + pirPrev.y +
               '" x2="' + pm.subject.x + '" y2="' + pm.subject.y + '"/>';
          s += '<circle class="pirghost" cx="' + pirPrev.x + '" cy="' + pirPrev.y + '" r="6"/>';
        }
        s += '<circle class="pirsubject ' + trip + '" cx="' + pm.subject.x + '" cy="' + pm.subject.y + '" r="6"' +
             ((transient && pirMoved) ? ' style="transform:translate(' + (pirPrev.x - pm.subject.x) +
              'px,' + (pirPrev.y - pm.subject.y) + 'px)"' : '') + '/>';
        if (transient && !RM && pirFresh)
          s += '<circle class="pirripple" cx="' + pm.subject.x + '" cy="' + pm.subject.y + '" r="6"/>';
      }
      var pstat = pm.status != null ? pm.status : (pm.subject ? (pm.tripped ? 'IR TRIPPED' : 'IR CLEAR') : '');
      if (pstat){
        s += '<rect class="pirstatusbg ' + trip + (transient && pirFresh ? ' fresh' : '') + '" x="0" y="0" width="132" height="20"/>' +
             '<text class="pirstatustext" x="8" y="14">' + esc(pstat) + '</text>';
      }
      if (pm.banner){
        s += '<rect class="pirbannerbg" x="0" y="150" width="320" height="30"/>' +
             '<text class="pirbannertext" x="160" y="169" text-anchor="middle">' + esc(pm.banner) + '</text>';
      }
      return s + '</svg></div>';
    };
    var cpts = pm.conePoints.map(function(p){ return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var pirTransients = pirFresh || pirMoved;
    h += buildPir(true);
    hBaseline = pirTransients ? buildPir(false) : null;
  } else if (type === 'tiles'){
    var tlm = tilesModel(panel, state);
    h += '<div class="tlgrid">';
    tlm.forEach(function(t){
      h += '<div class="tltile' + (t.state == null ? ' dim' : '') + '">';
      h += '<span class="tllabel">' + esc(t.label) + '</span>';
      h += '<span class="tlstate"' + (t.color ? ' style="color:' + t.color + ';border-color:' + t.color + '"' : '') + '>' +
           (t.state != null ? esc(t.state) : '&#8212;') + '</span>';
      h += '<span class="tlsub">' + esc(t.sub) + '</span>';
      h += '</div>';
    });
    h += '</div>';
  } else if (type === 'signal'){
    var sgm = signalModel(panel, state);
    h += '<div class="sgrows">';
    sgm.forEach(function(l){
      h += '<div class="sgrow s-' + l.state + '">';
      h += '<span class="sgtag">' + (l.transport ? esc(l.transport.toUpperCase()) : '') + '</span>';
      h += '<span class="sglabel">' + esc(l.label) + '</span>';
      h += '<span class="sgbars">';
      for (var sb = 1; sb <= 4; sb++)
        h += '<span class="sgbar b' + sb + (l.bars != null && sb <= l.bars ? ' on' : '') + '"></span>';
      h += '</span>';
      h += '<span class="sgstate">' + l.state.toUpperCase() + '</span>';
      h += '<span class="sgnote">' + esc(l.note) + '</span>';
      h += '</div>';
    });
    h += '</div>';
  } else if (type === 'homemap'){
    var hm = homemapModel(panel, state);
    var hmThermalPrev = host._hmThermal || Object.create(null), hmThermalNow = Object.create(null), hmClearing = Object.create(null);
    var hmPrev = host._hmStates || Object.create(null), hmNow = Object.create(null);
    var hmFresh = Object.create(null), hmHasFresh = false, hmDoors = Object.create(null);
    hm.devices.forEach(function(d){
      hmThermalNow[d.id] = d.thermal;
      if (animate && d.thermal === 'normal' && hmThermalPrev[d.id] && hmThermalPrev[d.id] !== 'normal'){
        hmClearing[d.id] = hmThermalPrev[d.id]; hmHasFresh = true;
      }
      hmNow[d.id] = d.state;
      if (animate && d.kind === 'entry' && hmPrev[d.id] !== undefined &&
          ((d.state === 'open') !== (hmPrev[d.id] === 'open'))){
        hmDoors[d.id] = d.state === 'open' ? 'opening' : 'closing'; hmHasFresh = true;
      }
      if (animate && hmPrev[d.id] !== undefined && hmPrev[d.id] !== d.state &&
          ((d.kind === 'camera' && d.state === 'detect') ||
           (d.kind === 'entry' && d.state === 'alert') || (d.kind === 'hub' && d.state === 'rx') ||
           (d.kind === 'sensor' && ['warn','alert'].indexOf(d.state) >= 0))){
        hmFresh[d.id] = true; hmHasFresh = true;
      }
    });
    host._hmStates = hmNow;
    host._hmThermal = hmThermalNow;
    var hmSubjPrev = host._hmSubjPrev || Object.create(null), hmSubjNow = Object.create(null);
    var hmMoved = Object.create(null), hmHasMoved = false;
    hm.subjects.forEach(function(sub){
      if (sub.hidden) return;
      var prev = hmSubjPrev[sub.id];
      hmSubjNow[sub.id] = {x: sub.x, y: sub.y};
      if (animate && prev && (prev.x !== sub.x || prev.y !== sub.y)){
        hmMoved[sub.id] = true; hmHasMoved = true;
      }
    });
    /* Hidden/removed subjects lose their previous position before reappearing. */
    host._hmSubjPrev = hmSubjNow;
    var hmSignals = animate && typeof stepIdx === 'number' && stepIdx >= 0 ? hm.signals : [];
    var buildHomemap = function(transient){
      var o = hm.outline;
      var sy = HOMEMAP_Y_SCALE;
      var s = '<svg class="hmframe" viewBox="0 0 320 ' + HOMEMAP_DISPLAY_HEIGHT + '" role="img" aria-label="' + esc(panel.title || 'Home device map') + '">';
      var spaces = homemapRoomModel(panel, hm);
      function drawSpace(space){
        var room = space.room, outdoor = room.kind === 'outdoor';
        s += '<g class="hmspace hm-room-' + space.tone + (outdoor ? ' hm-outdoor' : '') + '" data-home-room="' + panel.rooms.indexOf(room) + '">';
        s += '<rect class="hmroom" x="' + room.x + '" y="' + (room.y * sy) + '" width="' + room.w + '" height="' + (room.h * sy) + '" rx="2"/>';
        if (!outdoor) s += '<path class="hmroomwall" d="M' + (room.x + 2) + ' ' + ((room.y + room.h) * sy - 2) + ' V' + (room.y * sy + 2) + ' H' + (room.x + room.w - 2) + '"/>';
        s += '<text class="hmroomlabel" x="' + (room.x + 6) + '" y="' + (room.y * sy + 10) + '">' + esc(room.label || '') + '</text></g>';
      }
      spaces.filter(function(space){return space.room.kind === 'outdoor';}).forEach(drawSpace);
      s += '<rect class="hmfoundation" x="' + o.x + '" y="' + (o.y * sy + 2) + '" width="' + o.w + '" height="' + (o.h * sy) + '" rx="9"/>';
      s += '<rect class="hmoutline" x="' + o.x + '" y="' + (o.y * sy) + '" width="' + o.w + '" height="' + (o.h * sy) + '" rx="9"/>';
      spaces.filter(function(space){return space.room.kind !== 'outdoor';}).forEach(drawSpace);
      if (transient && hmHasMoved) hm.subjects.forEach(function(sub){
        if (!hmMoved[sub.id]) return;
        var prev = hmSubjPrev[sub.id];
        s += '<path class="hmtrail" d="M' + prev.x + ' ' + (prev.y * sy) + ' L' + sub.x + ' ' + (sub.y * sy) + '"/>';
      });
      /* Direction remains readable while paused and under reduced motion.
         Animated step paints add traveling packets over the route. */
      if (typeof stepIdx === 'number' && stepIdx >= 0) hm.signals.forEach(function(sig){
        var fromY = sig.fromXY.y * sy, toY = sig.toXY.y * sy;
        var dx = sig.toXY.x - sig.fromXY.x, dy = toY - fromY;
        var length = Math.sqrt(dx * dx + dy * dy); if (length < 24) return;
        var ux = dx / length, uy = dy / length;
        var x = sig.toXY.x - ux * 13, y = toY - uy * 13;
        s += '<g class="hmlink"><title>' + esc(sig.from + ' → ' + sig.to) + '</title>' +
          '<path class="hmlinkglow" d="M' + (sig.fromXY.x + ux * 12) + ' ' + (fromY + uy * 12) + ' L' + x + ' ' + y + '"/>' +
          '<path class="hmlinkroute" d="M' + (sig.fromXY.x + ux * 12) + ' ' + (fromY + uy * 12) + ' L' + x + ' ' + y + '"/>' +
          '<path class="hmlinktip" d="M' + (x - ux * 5 - uy * 3) + ' ' + (y - uy * 5 + ux * 3) +
          ' L' + x + ' ' + y + ' L' + (x - ux * 5 + uy * 3) + ' ' + (y - uy * 5 - ux * 3) + '"/></g>';
      });
      /* Wedges below all markers, so one camera cannot obscure another. */
      hm.devices.forEach(function(d){
        if (d.kind !== 'camera' || ['scan', 'detect', 'rec'].indexOf(d.state) < 0) return;
        var a1 = (d.facing - d.spread / 2) * Math.PI / 180;
        var a2 = (d.facing + d.spread / 2) * Math.PI / 180;
        var mid = d.facing * Math.PI / 180;
        s += '<g class="hmdev hm-camera hm-' + esc(d.state) + '" transform="scale(1 ' + sy + ')">';
        s += '<path class="hmwedge" d="M' + d.x + ' ' + d.y +
          ' L' + (d.x + d.range * Math.cos(a1)).toFixed(1) + ' ' + (d.y + d.range * Math.sin(a1)).toFixed(1) +
          ' A' + d.range + ' ' + d.range + ' 0 0 1 ' + (d.x + d.range * Math.cos(a2)).toFixed(1) + ' ' +
          (d.y + d.range * Math.sin(a2)).toFixed(1) + ' Z"/>';
        if (!RM) s += '<g class="hmsweep" style="transform-origin:' + d.x + 'px ' + d.y + 'px;--sw:' +
          (d.spread / 2 - 2) + 'deg"><line x1="' + d.x + '" y1="' + d.y + '" x2="' +
          (d.x + (d.range - 3) * Math.cos(mid)).toFixed(1) + '" y2="' +
          (d.y + (d.range - 3) * Math.sin(mid)).toFixed(1) + '"/></g>';
        s += '</g>';
      });
      hm.devices.forEach(function(d){
        if (d.display === 'door'){ s += homemapDoorHTML(d, transient ? hmDoors[d.id] : null, hm.outline, transient ? hmClearing[d.id] : null); return; }
        s += '<g class="hmdev hm-' + esc(d.kind) + ' hm-' + esc(d.state) + '" data-device="' + esc(d.id) + '" transform="translate(0 ' + (d.y * (sy - 1)).toFixed(3) + ')">' +
          '<title>' + esc(d.label) + ': ' + esc(d.state) + (d.thermal !== 'normal' ? ' · ' + d.thermal : '') + '</title>';
        s += homemapThermalHTML(d, 1, transient ? hmClearing[d.id] : null);
        s += '<circle class="hmdevice-aura" cx="' + d.x + '" cy="' + d.y + '" r="13"/>';
        if (transient && hmFresh[d.id]) s += '<circle class="' + (d.kind === 'hub' ? 'hmglow' : 'hmripple') +
          '" cx="' + d.x + '" cy="' + d.y + '" r="6"/>';
        s += '<circle class="hmmarker" cx="' + d.x + '" cy="' + d.y + '" r="8.5"/>';
        if (d.kind === 'hub') s += '<circle class="hmhubring" cx="' + d.x + '" cy="' + d.y + '" r="10"/>';
        /* tx: steady looping broadcast waves — part of the baseline, so an
           unchanged step repaint leaves the animation running */
        if (d.kind === 'hub' && d.state === 'tx')
          s += '<circle class="hmtxring" cx="' + d.x + '" cy="' + d.y + '" r="8"/>' +
               '<circle class="hmtxring hmtxring2" cx="' + d.x + '" cy="' + d.y + '" r="8"/>';
        /* rec: the classic blinking recording light beside the camera dot —
           steady markup, so the blink survives unchanged step repaints */
        if (d.kind === 'camera' && d.state === 'rec')
          s += '<circle class="hmrecdot" cx="' + (d.x + 7) + '" cy="' + (d.y - 7) + '" r="2.5"/>';
        if (d.kind === 'entry'){
          s += '<path class="hmentry" d="M' + (d.x - 3.5) + ' ' + (d.y + 5) + ' v-10 h7 v10"/>';
          s += '<path class="hmdoorleaf' + (transient && hmDoors[d.id] ? ' hmdoor-' + hmDoors[d.id] : '') + '" style="transform-origin:' + (d.x - 3.5) + 'px ' + (d.y + 5) +
            'px" d="M' + (d.x - 3.5) + ' ' + (d.y + 5) + ' h7"/>';
        } else {
          var deviceIcon = d.kind === 'camera' ? 'camera' : d.kind === 'hub' ? 'router' : d.icon;
          s += '<use class="hmicon hmdeviceglyph" href="#i-' + esc(deviceIcon) + '" x="' +
            (d.x - 6) + '" y="' + (d.y - 6) + '" width="12" height="12"/>';
        }
        var labelY = d.y > 139 ? d.y - 25 : d.y + 20;
        var labelX = clamp(d.x, 28, 292);
        s += '<text class="hmlbl" x="' + labelX + '" y="' + labelY +
          '" text-anchor="middle">' + esc(d.label) + '</text></g>';
      });
      hm.subjects.forEach(function(sub){
        if (sub.hidden) return;
        var prev = hmSubjPrev[sub.id];
        s += '<g transform="translate(0 ' + (sub.y * (sy - 1)).toFixed(3) + ')"><g class="hmsubject" data-subject="' + esc(sub.id) + '"' +
          ((transient && hmMoved[sub.id]) ? ' style="transform:translate(' + (prev.x - sub.x) +
            'px,' + ((prev.y - sub.y) * sy) + 'px)"' : '') + '><title>' + esc(sub.label) + '</title>';
        s += '<ellipse class="hmactor-shadow" cx="' + sub.x + '" cy="' + (sub.y + 9) + '" rx="7" ry="2.2"/>';
        s += '<circle class="hmsubjectdot" cx="' + sub.x + '" cy="' + sub.y + '" r="7"/>';
        if (sub.icon) s += '<use class="hmactor-icon" href="#i-' + esc(sub.icon) + '" x="' +
          (sub.x - 5) + '" y="' + (sub.y - 5) + '" width="10" height="10"/>';
        else s += '<circle class="hmactor-icon" cx="' + sub.x + '" cy="' + (sub.y - 2.2) + '" r="1.8"/>' +
          '<path class="hmactor-icon" d="M' + (sub.x - 3.4) + ' ' + (sub.y + 4) + ' v-1 a3.4 3.4 0 0 1 6.8 0 v1 Z"/>';
        if (panel.showSubjectLabels === true)
          s += '<text class="hmlbl hmactor-label" x="' + clamp(sub.x, 24, 296) + '" y="' + (sub.y > 146 ? sub.y - 12 : sub.y + 19) +
            '" text-anchor="middle">' + esc(sub.label) + '</text>';
        s += '</g></g>';
      });
      if (!hm.devices.length) s += '<text class="hmlbl" x="160" y="' + (HOMEMAP_DISPLAY_HEIGHT / 2 + 4) + '" text-anchor="middle">No devices configured</text>';
      if (transient) hmSignals.forEach(function(sig, i){
        s += '<circle class="hmsig" r="3" style="--hx1:' + sig.fromXY.x + 'px;--hy1:' + (sig.fromXY.y * sy) +
          'px;--hx2:' + sig.toXY.x + 'px;--hy2:' + (sig.toXY.y * sy) + 'px;animation-delay:' + (i * 0.25) + 's"/>';
      });
      return s + '</svg>';
    };
    h += buildHomemap(true);
    hBaseline = (hmHasFresh || hmHasMoved || hmSignals.length) ? buildHomemap(false) : null;
  } else if (type === 'radar'){
    var rm2 = radarModel(panel, state);
    var ridx = typeof stepIdx === 'number' ? stepIdx : 0;
    /* one-shot ripple + glide fire on the clear→alert transition / a move,
       with a steady baseline stored so the following unchanged step skips
       (same discipline as pir) */
    var rdFresh = animate && rm2.alert && host._rdAlert === false;
    var rdPrev = host._rdPrev || null;
    var rdMoved = animate && rdPrev && rm2.subject &&
                  (rdPrev.x !== rm2.subject.x || rdPrev.y !== rm2.subject.y);
    host._rdAlert = rm2.alert;
    host._rdPrev = rm2.subject ? {x: rm2.subject.x, y: rm2.subject.y} : null;
    var rdA1 = (rm2.facing - rm2.spread / 2) * Math.PI / 180;
    var rdA2 = (rm2.facing + rm2.spread / 2) * Math.PI / 180;
    var rdFull = rm2.spread >= 359.9;
    var rdArc = function(r){
      if (rdFull) return null;
      var x1 = rm2.sensor.x + r * Math.cos(rdA1), y1 = rm2.sensor.y + r * Math.sin(rdA1);
      var x2 = rm2.sensor.x + r * Math.cos(rdA2), y2 = rm2.sensor.y + r * Math.sin(rdA2);
      return 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A' + r.toFixed(1) + ' ' + r.toFixed(1) +
             ' 0 ' + ((rdA2 - rdA1) > Math.PI ? 1 : 0) + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
    };
    /* track: the subject positions of every folded step up to the current
       one — engine-derived, so any step jump redraws it consistently */
    var rdTrack = [];
    if (Array.isArray(states)){
      for (var rti = 0; rti <= Math.min(ridx, states.length - 1); rti++){
        /* run each folded step through the model so POLAR subjects convert
           exactly like the live one; dedupe parked positions so unchanged
           steps keep identical markup (rebuild skip) */
        var rsub = radarModel(panel, states[rti]).subject;
        var last = rdTrack.length ? rdTrack[rdTrack.length - 1] : undefined;
        if (rsub){
          if (!(last && last[0] === rsub.x && last[1] === rsub.y))
            rdTrack.push([rsub.x, rsub.y]);
        } else if (last !== null && rdTrack.length){
          rdTrack.push(null);
        }
      }
    }
    var buildRadar = function(transient){
      var s = '<div class="rdbox"><svg class="rdframe" viewBox="0 0 320 180" role="img" aria-label="' +
              esc(panel.title || 'radar range view') + '">';
      s += '<rect width="320" height="180" class="rdbg"/>';
      rm2.zones.forEach(function(z){
        var zpts = z.points.map(function(p){ return p[0] + ',' + p[1]; }).join(' ');
        var occ = rm2.occupied.indexOf(z.id) >= 0;
        s += '<polygon class="rdzone' + (occ ? ' occ' : '') + '" points="' + zpts + '"/>';
        s += '<text class="rdzlbl' + (occ ? ' occ' : '') + '" x="' + (z.points[0][0] + 5) +
             '" y="' + (z.points[0][1] + 13) + '">' + esc(z.label) + '</text>';
      });
      var radii = rm2.ringRadii;
      for (var ri = 1; ri <= rm2.rings; ri++){
        var rr = radii ? radii[ri - 1] : rm2.range * ri / rm2.rings;
        if (rdFull) s += '<circle class="rdring" cx="' + rm2.sensor.x + '" cy="' + rm2.sensor.y + '" r="' + rr.toFixed(1) + '"/>';
        else s += '<path class="rdring" d="' + rdArc(rr) + '"/>';
      }
      if (!rdFull){
        [rdA1, rdA2].forEach(function(a){
          s += '<line class="rdedge" x1="' + rm2.sensor.x + '" y1="' + rm2.sensor.y +
               '" x2="' + (rm2.sensor.x + rm2.range * Math.cos(a)).toFixed(1) +
               '" y2="' + (rm2.sensor.y + rm2.range * Math.sin(a)).toFixed(1) + '"/>';
        });
      }
      if (rm2.threshold != null){
        if (rdFull) s += '<circle class="rdthresh" cx="' + rm2.sensor.x + '" cy="' + rm2.sensor.y + '" r="' + rm2.threshold.toFixed(1) + '"/>';
        else s += '<path class="rdthresh" d="' + rdArc(rm2.threshold) + '"/>';
      }
      if (!RM){
        var rmid = rm2.facing * Math.PI / 180;
        s += '<g class="rdsweep" style="transform-origin:' + rm2.sensor.x + 'px ' + rm2.sensor.y +
             'px;--sw:' + Math.max(0, Math.min(rm2.spread, 358) / 2 - 2).toFixed(1) + 'deg">' +
             '<line x1="' + rm2.sensor.x + '" y1="' + rm2.sensor.y +
             '" x2="' + (rm2.sensor.x + (rm2.range - 3) * Math.cos(rmid)).toFixed(1) +
             '" y2="' + (rm2.sensor.y + (rm2.range - 3) * Math.sin(rmid)).toFixed(1) + '"/></g>';
      }
      s += '<circle class="rdsensor" cx="' + rm2.sensor.x + '" cy="' + rm2.sensor.y + '" r="5"/>';
      /* track dots + connecting segments (broken at steps with no subject) */
      var seg = [];
      var flushSeg = function(){
        if (seg.length > 1) s += '<polyline class="rdtrack" points="' + seg.join(' ') + '"/>';
        seg = [];
      };
      rdTrack.forEach(function(p){
        if (!p){ flushSeg(); return; }
        seg.push(p[0] + ',' + p[1]);
        s += '<circle class="rdtrackdot" cx="' + p[0] + '" cy="' + p[1] + '" r="2"/>';
      });
      flushSeg();
      if (rm2.subject){
        s += '<circle class="rdsubject ' + (rm2.alert ? 'alert' : 'clear') + '" cx="' + rm2.subject.x +
             '" cy="' + rm2.subject.y + '" r="6"' +
             ((transient && rdMoved) ? ' style="transform:translate(' + (rdPrev.x - rm2.subject.x) +
              'px,' + (rdPrev.y - rm2.subject.y) + 'px)"' : '') + '/>';
        if (transient && !RM && rdFresh)
          s += '<circle class="rdripple" cx="' + rm2.subject.x + '" cy="' + rm2.subject.y + '" r="6"/>';
      }
      var rstat = rm2.status != null ? rm2.status : (rm2.subject ? (rm2.alert ? 'RANGE ALERT' : 'CLEAR') : '');
      if (rstat){
        s += '<rect class="rdstatusbg ' + (rm2.alert ? 'alert' : 'clear') +
             (transient && rdFresh ? ' fresh' : '') + '" x="0" y="0" width="132" height="20"/>' +
             '<text class="rdstatustext" x="8" y="14">' + esc(rstat) + '</text>';
      }
      if (rm2.banner){
        s += '<rect class="rdbannerbg" x="0" y="150" width="320" height="30"/>' +
             '<text class="rdbannertext" x="160" y="169" text-anchor="middle">' + esc(rm2.banner) + '</text>';
      }
      return s + '</svg></div>';
    };
    h += buildRadar(true);
    hBaseline = (rdFresh || rdMoved) ? buildRadar(false) : null;
  } else if (type === 'xray'){
    var xm = xrayModel(panel.layers, state.layers);
    var xopen = '', xclose = '';
    xm.forEach(function(l){
      xopen += '<div class="xlayer ' + (l.open ? 'open' : 'sealed') + '">' +
               '<div class="xhead"><span class="xstate">' + (l.open ? 'OPEN' : 'SEALED') + '</span>' +
               '<span class="xname">' + esc(l.label) + '</span>' +
               (l.holder ? '<span class="xholder">key: ' + esc(l.holder) + '</span>' : '') + '</div>';
      xclose = '</div>' + xclose;
    });
    h += '<div class="xray">' + xopen + '<div class="xcore">payload</div>' + xclose + '</div>';
    if (state.hop != null){
      var readable = xm.length > 0 && xm.every(function(l){ return l.open; });
      h += '<div class="xfoot' + (readable ? ' yes' : ' no') + '">at <b>' + esc(String(state.hop)) + '</b> — payload ' +
           (readable ? 'READABLE here' : 'NOT readable here') + '</div>';
    }
  } else if (type === 'queue'){
    h += queuePanelHTML(panel, state);
  } else if (type === 'inflight'){
    var ifmNow = inflightModel(panel, state, Array.isArray(states) ? states.length : state.stepCount, stepIdx);
    inflightFramesNow = inflightBarFrames(ifmNow);
    inflightFramesPrev = host._ifFrames || null;
    host._ifFrames = {};
    inflightFramesNow.forEach(function(frame){ host._ifFrames[frame.key] = frame.width; });
    h += inflightPanelHTML(panel, state, Array.isArray(states) ? states.length : state.stepCount, stepIdx);
  } else if (type === 'deviceapp'){
    var daFresh=animate && validRevealIndex(host._daStep) && validRevealIndex(stepIdx) && stepIdx===host._daStep+1;
    host._daStep=validRevealIndex(stepIdx)?stepIdx:null;
    h+=deviceAppPanelHTML(panel,state,daFresh);
    hBaseline=daFresh?deviceAppPanelHTML(panel,state,false):null;
  } else if (type === 'phone'){
    var phm = phoneModel(state);
    /* Like pir/radar, entry is derived from the transition we actually
       painted, never from the target snapshot's `_phoneAdded` marker. That
       marker is also present when navigating backward onto its source step.
       Requiring an adjacent forward step and a strictly deeper stack keeps
       backward navigation, jumps/deep links, and settled export renders free
       of one-shot markup. */
    var phonePrevStack = Array.isArray(host._phoneStack) ? host._phoneStack : null;
    var phoneDeeper = phonePrevStack !== null && phm.notifications.length > phonePrevStack.length &&
      phonePrevStack.every(function(previousCard, previousIndex){
        var nextCard = phm.notifications[phm.notifications.length - phonePrevStack.length + previousIndex];
        return nextCard && nextCard.app === previousCard.app &&
          nextCard.title === previousCard.title && nextCard.text === previousCard.text;
      });
    var phoneFresh = animate && validRevealIndex(host._phoneStep) &&
      validRevealIndex(stepIdx) && stepIdx === host._phoneStep + 1 && phoneDeeper;
    host._phoneStep = validRevealIndex(stepIdx) ? stepIdx : null;
    host._phoneStack = phm.notifications.map(function(card){
      return {app:card.app, title:card.title, text:card.text};
    });
    h += phonePanelHTML(panel, state, phoneFresh);
    hBaseline = phoneFresh ? phonePanelHTML(panel, state, false) : null;
  } else {
    h += '<div class="punknown">unknown panel type: ' + esc(String(panel.type)) + '</div>';
  }

  /* An immediate jump must also cancel a presentation that may still be in
     flight from the preceding click. Do this before the unchanged-markup
     return: _lastHTML already represents the absolute target while the live
     DOM may temporarily carry tween widths, numbers, or one-shot classes. */
  if (!animate){
    if (host._thTween && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(host._thTween);
    host._thTween = null;
    if (host._pulseTimer){ clearTimeout(host._pulseTimer); host._pulseTimer = null; }
    host._ifEpoch = (host._ifEpoch || 0) + 1;
    if (typeof host.querySelectorAll === 'function'){
      var transientEls = host.querySelectorAll('.dv-chip-pulse,.dv-bar-enter,.pirghost,.pirtrail,.pirripple,.rdripple,.hmripple,.hmglow,.hmsig,.hmtrail');
      for (var te = transientEls.length - 1; te >= 0; te--){
        var transientEl = transientEls[te];
        if (transientEl.classList){
          transientEl.classList.remove('dv-chip-pulse');
          transientEl.classList.remove('dv-bar-enter');
        }
        if (/^(pirghost|pirtrail|pirripple|rdripple|hmripple|hmglow|hmsig|hmtrail)$/.test(transientEl.getAttribute('class') || '') &&
            transientEl.parentNode) transientEl.parentNode.removeChild(transientEl);
      }
      var freshEls = host.querySelectorAll('.fresh');
      for (var fe = 0; fe < freshEls.length; fe++) freshEls[fe].classList.remove('fresh');
    }
    var settleLevel = function(fillSel, pctNow, valSel, valNow){
      var fill = host.querySelector(fillSel);
      if (fill){ fill.style.transition = 'none'; fill.style.width = pctNow.toFixed(1) + '%'; }
      var value = host.querySelector(valSel);
      if (value && value.firstChild && valNow != null) value.firstChild.nodeValue = String(valNow);
    };
    if (type === 'thermo') settleLevel('.thfill', tm.pct, '.thval', tv);
    else if (type === 'battery') settleLevel('.btfill', bm.charge != null ? bm.charge : 0, '.btval', bv);
    else if (type === 'gauge') settleLevel('.gaugefill', pct, '.gaugeval', v);
    var subjectEl = host.querySelector(type === 'pir' ? '.pirsubject' : (type === 'radar' ? '.rdsubject' : '.dv-no-subject'));
    if (subjectEl) subjectEl.style.transform = 'translate(0,0)';
    if (type === 'homemap' && typeof host.querySelectorAll === 'function'){
      var hmLeaves = host.querySelectorAll('.hmdoor-opening,.hmdoor-closing');
      for (var hl = 0; hl < hmLeaves.length; hl++){
        hmLeaves[hl].classList.remove('hmdoor-opening'); hmLeaves[hl].classList.remove('hmdoor-closing');
      }
      var hmSettle = host.querySelectorAll('.hmsubject[style]');
      for (var hs = 0; hs < hmSettle.length; hs++){
        hmSettle[hs].style.transition = 'none';
        hmSettle[hs].style.transform = 'translate(0,0)';
      }
    }
    if (type === 'inflight' && inflightFramesNow && typeof host.querySelectorAll === 'function'){
      var settleBars = host.querySelectorAll('.ifbar');
      inflightFramesNow.forEach(function(frame, i){
        if (!settleBars[i]) return;
        settleBars[i].style.transition = 'none';
        settleBars[i].style.width = frame.width.toFixed(3) + '%';
        settleBars[i].style.opacity = '1';
      });
    }
  }
  /* unchanged markup: leave the DOM alone entirely, so running animations
     and timers (viewfinder walker + REC timecode, pir sweep/pings, led
     pulses) CONTINUE across a step change instead of restarting */
  if (host._lastHTML === h) return;

  /* screen surgical path: consecutive modes that both show the SAME scene
     (active / live / rec / save) swap only the mode class and the overlay chips,
     keeping the scene subtree — the walker's animation state survives.
     Any other transition (off/boot involved, or a first render) rebuilds. */
  var surgical = false;
  var SCENE_SHOWING = {active: true, live: true, rec: true, save: true};
  if (type === 'screen' && host._lastHTML != null &&
      sceneName === host._scrScene && SCENE_SHOWING[mode] && SCENE_SHOWING[host._scrMode]){
    var scrBox = host.querySelector('.screenbox');
    if (scrBox){
      surgical = true;
      scrBox.className = scrClass;
      if (scrOvl !== host._scrOverlay){
        var oldOvls = scrBox.querySelectorAll('.ovl');
        for (var ov = oldOvls.length - 1; ov >= 0; ov--)
          oldOvls[ov].parentNode.removeChild(oldOvls[ov]);
        if (scrOvl) scrBox.insertAdjacentHTML('beforeend', scrOvl);
      }
    }
  }
  host._scrMode = (type === 'screen') ? mode : undefined;
  host._scrScene = (type === 'screen') ? sceneName : undefined;
  host._scrOverlay = (type === 'screen') ? scrOvl : undefined;
  host._lastHTML = (hBaseline != null) ? hBaseline : h;
  if (!surgical) host.innerHTML = h;
  if (type === 'deviceapp') bindDeviceAppSources(host,panel,state);

  /* Release each subject offset after a painted frame to start its glide. */
  if ((type === 'pir' || type === 'radar' || type === 'homemap') && animate){
    var glideEls = [];
    if (type === 'homemap'){
      if (typeof host.querySelectorAll === 'function') glideEls = host.querySelectorAll('.hmsubject[style]');
    } else {
      var glideEl = host.querySelector(type === 'pir' ? '.pirsubject[style]' : '.rdsubject[style]');
      if (glideEl) glideEls = [glideEl];
    }
    if (glideEls.length){
      /* Force offsets into layout before the double-rAF release. */
      for (var ge = 0; ge < glideEls.length; ge++) void glideEls[ge].getBoundingClientRect();
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        for (var gi = 0; gi < glideEls.length; gi++) glideEls[gi].style.transform = 'translate(0,0)';
      }); });
    }
  }

  /* thermo + battery: animate the fill bar from the previous step's width
     and count the numeric readout toward the new value, so a step change
     reads as the level moving rather than snapping (skipped under reduced
     motion). `decimals` controls the readout rounding (thermo 1, battery 0). */
  if (host._thTween){ cancelAnimationFrame(host._thTween); host._thTween = null; }
  var tweenLevel = function(pctNow, valNow, fillSel, valSel, decimals){
    var prev = host._thPrev;
    host._thPrev = {pct: pctNow, value: valNow};
    if (!animate || !prev || valNow == null) return;
    var fillEl = host.querySelector(fillSel);
    if (fillEl && typeof prev.pct === 'number' && Math.abs(prev.pct - pctNow) > 0.05){
      fillEl.style.transition = 'none';
      fillEl.style.width = prev.pct.toFixed(1) + '%';
      void fillEl.getBoundingClientRect(); /* paint the start width first */
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        fillEl.style.transition = '';
        fillEl.style.width = pctNow.toFixed(1) + '%';
      }); });
    }
    var valEl = host.querySelector(valSel);
    if (valEl && typeof prev.value === 'number' && prev.value !== valNow && valEl.firstChild){
      var mul = Math.pow(10, decimals);
      var from = prev.value, t0 = Date.now(), node = valEl.firstChild;
      var tick = function(){
        var k = Math.min(1, (Date.now() - t0) / 500);
        k = 1 - (1 - k) * (1 - k); /* ease-out */
        node.nodeValue = String(Math.round((from + (valNow - from) * k) * mul) / mul);
        if (k < 1) host._thTween = requestAnimationFrame(tick);
        else host._thTween = null;
      };
      host._thTween = requestAnimationFrame(tick);
    }
  };
  if (type === 'thermo'){
    var tmNow = thermoModel(panel, state);
    tweenLevel(tmNow.pct, tmNow.value, '.thfill', '.thval', 1);
  } else if (type === 'battery'){
    var bmNow = batteryModel(panel, state);
    tweenLevel(bmNow.charge != null ? bmNow.charge : 0, bmNow.charge, '.btfill', '.btval', 0);
  } else if (type === 'gauge'){
    var gvNow = typeof state.value === 'number' ? state.value : 0;
    var gmNow = typeof panel.max === 'number' && panel.max > 0 ? panel.max : 100;
    var gs = String(gvNow), gd = gs.indexOf('.') >= 0 ? Math.min(3, gs.length - gs.indexOf('.') - 1) : 0;
    tweenLevel(clamp(gvNow / gmNow * 100, 0, 100), gvNow, '.gaugefill', '.gaugeval', gd);
  }

  /* State-machine changes get one brief emphasis after the absolute target
     markup is installed. The transient class is never part of _lastHTML. */
  if (animate && pulseChanged && pulseSelector){
    var pulseEl = host.querySelector(pulseSelector);
    if (pulseEl && pulseEl.classList){
      if (host._pulseTimer) clearTimeout(host._pulseTimer);
      pulseEl.classList.add('dv-chip-pulse');
      host._pulseTimer = setTimeout(function(){
        pulseEl.classList.remove('dv-chip-pulse');
        host._pulseTimer = null;
      }, 620);
    }
  }

  /* A waterfall row that becomes revealed grows its bar from the leading
     edge. Rows already revealed do not replay when unrelated state changes. */
  if (animate && waterfallEntrants && typeof host.querySelectorAll === 'function'){
    var wfRows = host.querySelectorAll('.wfrow');
    waterfallEntrants.forEach(function(enters, i){
      if (!enters || !wfRows[i]) return;
      var wfBar = wfRows[i].querySelector('.wfbar');
      if (wfBar) wfBar.classList.add('dv-bar-enter');
    });
  }

  /* Inflight markup is rebuilt from the folded snapshot. On an adjacent step,
     seed matching bars with their previous width (or zero for a new bar),
     then release them to the target width. Jumps skip this hook entirely. */
  if (animate && inflightFramesPrev && inflightFramesNow &&
      typeof host.querySelectorAll === 'function' && typeof requestAnimationFrame === 'function'){
    var ifEls = host.querySelectorAll('.ifbar'), ifTweens = [];
    inflightFramesNow.forEach(function(frame, i){
      var ifEl = ifEls[i];
      if (!ifEl) return;
      var fromWidth = inflightFramesPrev[frame.key];
      var isNew = typeof fromWidth !== 'number';
      if (isNew) fromWidth = 0;
      if (!isNew && Math.abs(fromWidth - frame.width) < 0.001) return;
      ifEl.style.transition = 'none';
      ifEl.style.width = fromWidth.toFixed(3) + '%';
      if (isNew) ifEl.style.opacity = '0';
      ifTweens.push({el:ifEl, width:frame.width, fresh:isNew});
    });
    if (ifTweens.length){
      var ifEpoch = (host._ifEpoch || 0) + 1;
      host._ifEpoch = ifEpoch;
      void ifTweens[0].el.getBoundingClientRect();
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        if (host._ifEpoch !== ifEpoch) return;
        ifTweens.forEach(function(tween){
          tween.el.style.transition = '';
          tween.el.style.width = tween.width.toFixed(3) + '%';
          if (tween.fresh) tween.el.style.opacity = '1';
        });
      }); });
    }
  }

  /* log: the body is fixed-height and scrolls internally — keep the newest
     appended lines in view after a rebuild */
  if (type === 'log'){
    var plogEl = host.querySelector('.plog');
    if (plogEl && typeof plogEl.scrollHeight === 'number') plogEl.scrollTop = plogEl.scrollHeight;
  }

}

/* log panels are the only widgets that GROW as steps append lines, so they
   always render at the BOTTOM of the panel column — nothing below them can
   be pushed around. Relative order within each group is preserved. */
function panelOrder(panels){
  var fixed = [], growing = [];
  (panels || []).forEach(function(p){
    ((p && p.type === 'log') ? growing : fixed).push(p);
  });
  return fixed.concat(growing);
}

function buildPanels(asideEl, d, skin, primaryHost, primaryId){
  var folded = foldPanelStates(d);
  var traceNavigation = (d.steps || []).length && d.view !== 'ambient-only';
  var hosts = {};
  panelOrder(d.panels).forEach(function(p){
    if (!p || !p.id) return;
    var card = document.createElement('div');
    card.className = 'pwidget pt-' + (PANEL_TYPES.indexOf(p.type) >= 0 ? p.type : 'unknown');
    /* spec index, not render order — log panels are reordered to the end */
    card.setAttribute('data-dv-panel', String((d.panels || []).indexOf(p)));
    if (p.title){
      var t = document.createElement('div');
      t.className = 'ptitle'; t.textContent = p.title;
      card.appendChild(t);
    }
    var body = document.createElement('div');
    body.className = 'pbody';
    card.appendChild(body);
    (primaryHost && p.id === (primaryId || d.primaryPanel) ? primaryHost : asideEl).appendChild(card);
    hosts[p.id] = {panel: p, body: body};
    /* Homemap ambient state precedes step zero; other widgets keep their
       established first-folded-step preview. */
    var home = p.type === 'homemap';
    renderPanelBody(body, p, home ? p.initial : (folded[p.id] || [])[0],
      skin, p.type === 'trace' && !traceNavigation ? [] : folded[p.id] || [], home ? -1 : 0, false);
  });
  return {
    setDiagram: function(next){
      folded = foldPanelStates(next);
      traceNavigation = (next.steps || []).length && next.view !== 'ambient-only';
    },
    setStep: function(i, animate, ambient){
      Object.keys(hosts).forEach(function(pid){
        var states = folded[pid] || [];
        var si = Math.min(i, states.length - 1);
        var panel = hosts[pid].panel;
        var homeAmbient = ambient && panel.type === 'homemap';
        renderPanelBody(hosts[pid].body, panel, homeAmbient ? panel.initial : states[si], skin,
          panel.type === 'trace' && !traceNavigation ? [] : states, homeAmbient ? -1 : si, animate);
      });
    }
  };
}

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
    badge.setAttribute('transform','translate('+(Number(card.getAttribute('width'))-12)+' '+(Number(card.getAttribute('height'))-10)+')');
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
    panels.find(function(p){return p && typeof p.id === 'string' && p.id && p.type === 'homemap';}) || null;
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
  [['panel',panel.type === 'homemap' ? 'Home' : panel.title || 'Panel'],['flow','Data flow']].forEach(function(choice){
    var button = document.createElement('button'); button.type = 'button'; button.className = 'mbtn';
    button.textContent = choice[1]; button.setAttribute('data-view-focus',choice[0]);
    button.title = 'Make ' + choice[1] + ' the main view';
    button.addEventListener('click',function(){setMode(choice[0]);});
    buttons[choice[0]] = button; group.appendChild(button);
  });
  setMode(initial);
  return {panelId:panel.id, mode:function(){return mode;}, setMode:setMode,
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
  function syncOverflow(){
    if (destroyed || !board.clientWidth) return;
    var scrollable = board.scrollWidth > board.clientWidth + 1;
    if (scrollable && !wasScrollable) board.scrollLeft = (board.scrollWidth - board.clientWidth) / 2;
    board.classList.toggle('board-overflow', scrollable);
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
  var hint = document.createElement('span'); hint.className = 'board-scroll-hint';
  hint.textContent = 'Scroll sideways to explore'; group.appendChild(hint);
  legend.appendChild(group);
  board.tabIndex = 0; board.setAttribute('role', 'region');
  board.setAttribute('aria-label', (label || 'Flow') + ' diagram; scroll horizontally to explore');
  setMode('auto');
  var observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncOverflow) : null;
  if (observer) observer.observe(board);
  return {mode:function(){ return mode; }, setMode:setMode,
    destroy:function(){ destroyed = true; if (observer) observer.disconnect(); }};
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
  result.destroy=function(){if(bwrap._nodeLinks){bwrap._nodeLinks.destroy();bwrap._nodeLinks=null;}};
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

  var board = renderBoard(bwrap, activeDiagram, prefix, skin, protos, backlinks);
  lg.innerHTML = legendHTML(board.kindsUsed, board.anyRet, skin, protos);
  result.boardSize = createBoardSizeControl(boardDiv, lg, d.title || sec.heading);

  var view = VIEW_SET.indexOf(d.view) >= 0 ? d.view : 'ambient';
  var hasSteps = (d.steps || []).length > 0;
  var hasDelta = diagramHasDelta(d);
  var btnDelta = null, bar = null;
  function addFocusControl(){
    if (primaryPanel) result.presentation = createDiagramFocusControl(boardLayout, primaryPanel, aside, bar,
      d.primaryPanel === primaryPanel.id ? 'panel' : 'flow', function(host){
        if (result.stepper) result.stepper.scrollTargetEl = host;
      });
    var composition=createSectionComposition(box,boardLayout,d,boardDiv,bar,result.presentation,options && options.layoutTarget,function(host){
      if(result.stepper)result.stepper.scrollTargetEl=host;
    },result.stepper);
    if(composition)result.presentation=composition;
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
    return renderBoard(bwrap, next, prefix, skin, protos, backlinks);
  }}));
  stepper.copyButton = copyStep;
  if (view === 'step') stepper.enterStep(true); /* host may disable automatic playback */
  result.stepper = stepper;
  addFocusControl();
  return result;
}

function renderPage(view, page, skin, backlinks, options){
  var protos = resolveProtocols(page);
  var lanes = resolveLanes(page);
  backlinks = backlinks || Object.create(null);
  var renderSkin = skinBase(skin);
  view.className = 'docview ' + skinClasses(skin).join(' ');
  view.innerHTML = '';
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
  var sectionHeadings = [];
  pageBlocks.forEach(function(block){
    if (block.type === 'section') sectionHeadings.push(block.sec && block.sec.heading);
    else block.tabs.forEach(function(tab){
      tab.sections.forEach(function(sec){ sectionHeadings.push(sec && sec.heading); });
    });
  });
  var sectionRefs = sectionReferences(sectionHeadings);
  var deferredHides = [];
  var ctl = {view:view, tabBlock:null, tabBlocks:[], sections:[], steppers:[],
             onChange:null, activeTarget:{kind:'page'}, rendering:true};
  ctl.destroy = function(){
    ctl.destroyed = true;
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
  function addSection(container, sec, tabBlockIndex, tabIndex){
    var number = gi + 1;
    var reference = sectionRefs[gi];
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
    var rec = {number:number, reference:reference, tabBlock:tabBlockIndex, tab:tabIndex,
               sectionEl:built.sectionEl, stepper:built.stepper, boardSize:built.boardSize, prose:built.prose,
               flowDisclosure:built.flowDisclosure, presentation:built.presentation,
               contractCard:built.contractCard, contractRows:built.contractRows, destroy:built.destroy};
    ctl.sections.push(rec);
    if (built.stepper) ctl.steppers.push(rec);
    return built;
  }
  pageBlocks.forEach(function(block, bi){
    if (block.type === 'section'){
      addSection(view, block.sec, null, null);
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
        var built = addSection(panel, sec, tabBlockIndex, ti);
        if (built.stepper) panel._steppers.push(built.stepper);
      });
      panels.push(panel); buttons.push(btn); copyButtons.push(copy); slugs.push(slugify(t.label));
    });
    var tabCtl = null;
    function select(idx, focus, activate){
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
      return {number:sec.number, reference:sec.reference, tabBlock:sec.tabBlock, tab:sec.tab,
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
      if (diagramSec && diagramSec.stepper){
        st.d = String(diagramSec.reference);
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
      win.history.replaceState(null, '',
        withPreserved(h) || win.location.pathname + win.location.search);
      /* Fragments may contain heading slugs derived from a company document.
         Do not disclose them to an arbitrary embedder: mirroring stays off
         until a valid link-base handshake identifies the host, then targets
         only that origin. A same-origin dvSetLinkBase call is trusted by the
         browser's same-origin policy and uses this page's own origin. */
      if (mirrorSource && typeof mirrorSource.postMessage === 'function')
        mirrorSource.postMessage({type:'dv_fragment', fragment:h.replace(/^#/, '')}, mirrorOrigin);
    } catch (ex) { /* sandboxed viewers may refuse; deep links just stay off */ }
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
    clearRowTarget();
    /* Collapse affects document height, so restore it before routing and,
       critically, before the resolved target is scrolled into view. */
    applyCollapseState(st);
    selectRoute(target);
    var targetEl = null;
    var diagramTarget = target.diagram;
    if (diagramTarget){
      var diagramSec = section(diagramTarget.section), sp = diagramSec && diagramSec.stepper;
      if (sp && sp.selectPath) sp.selectPath(st.p || sp.paths()[0].id);
      if (sp && diagramTarget.mode === 'step'){
        sp.enterStep(false);
        var pathStep = sp.stepIndexOf(st.s);
        if (pathStep >= 0) sp.jump(pathStep);
      } else if (sp && diagramTarget.mode === 'ambient') sp.enterAmbient();
      targetEl = sp && (sp.scrollTargetEl || sp.sectionEl);
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
      return win.location.href.split('#')[0] + '#embed=' + encodeURIComponent(String(sec.reference));
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
