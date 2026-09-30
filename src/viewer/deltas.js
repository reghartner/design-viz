/* Delta markers share their appearance and optional details across the board
   and step controls. Popovers belong to the rendered board/chip generation. */
function appendDeltaMarker(parent, value, label, x, y){
  var badge = document.createElementNS(SVGNS, 'g'), details = deltaDetails(value);
  badge.setAttribute('class', 'dvdelta' + (details.interactive ? ' dvdelta-action' : ''));
  badge.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
  badge.innerHTML = '<rect class="dvdelta-hit" x="-12" y="-12" width="24" height="24" rx="12"/>' +
    '<path class="dvdelta-mark" d="M0 -5.5 L5.5 4 L-5.5 4 Z"/>';
  var title = document.createElementNS(SVGNS, 'title');
  title.textContent = details.interactive ? 'View change details · ' + label : 'Changed · ' + label;
  badge.appendChild(title);
  if (details.interactive){
    badge.setAttribute('role', 'button'); badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', 'Change details for ' + label);
    badge.setAttribute('aria-haspopup', 'dialog'); badge.setAttribute('aria-expanded', 'false');
    badge._deltaDetails = details; badge._deltaLabel = label;
  } else {
    badge.setAttribute('role', 'img'); badge.setAttribute('aria-label', 'Changed · ' + label);
  }
  parent.appendChild(badge);
  return badge;
}

function decorateDeltaChips(host, source){
  host.querySelectorAll('.schip.dvd').forEach(function(chip){
    var value = source.steps[Number(chip.getAttribute('data-step-source'))];
    // Every marked step uses the shared glyph. A sibling keeps navigation and
    // optional details separate, including edgeless steps, without nested buttons.
    var wrap = document.createElement('span'); wrap.className = 'delta-chip-wrap';
    wrap.style.gridColumn = chip.style.gridColumn; wrap.style.gridRow = chip.style.gridRow;
    chip.parentNode.insertBefore(wrap, chip); wrap.appendChild(chip);
    var icon = document.createElementNS(SVGNS, 'svg');
    icon.setAttribute('class', 'delta-chip-icon'); icon.setAttribute('viewBox', '-12 -12 24 24');
    wrap.appendChild(icon);
    appendDeltaMarker(icon, value, value.title || value.id || 'step ' + (Number(chip.getAttribute('data-step-source')) + 1), 0, 0);
  });
}

function wireDeltaDetails(host, prefix, scope){
  var triggers = (scope || host).querySelectorAll('.dvdelta-action');
  if (!triggers.length) return null;
  var pop = document.createElement('div');
  pop.className = 'nbackpop node-link-menu delta-popover'; pop.id = prefix + '-delta-details';
  pop.setAttribute('role', 'dialog'); pop.setAttribute('popover', 'manual'); pop.hidden = true;
  host.appendChild(pop);
  var active = null, destroyed = false, scrollAtOpen = [], listeners = [];
  function listen(target, type, fn){
    target.addEventListener(type, fn); listeners.push(function(){ target.removeEventListener(type, fn); });
  }
  function inside(target){ return pop.contains(target) || !!(active && active.contains(target)); }
  function close(returnFocus){
    if (!active) return;
    var trigger = active; active = null; scrollAtOpen = [];
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('focusin', outside, true);
    document.removeEventListener('keydown', escape, true);
    document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize);
    if (pop.hidePopover && pop.matches(':popover-open')) pop.hidePopover();
    pop.hidden = true;
    if (returnFocus && trigger.isConnected) trigger.focus();
  }
  function outside(ev){ if (!inside(ev.target)) close(false); }
  function escape(ev){ if (ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); close(true); } }
  function resize(){ close(false); }
  function scroll(ev){
    var target = ev.target === document || ev.target.nodeType === 9 ? document.scrollingElement : ev.target;
    if (scrollAtOpen.some(function(s){ return s.el === target && (s.x !== target.scrollLeft || s.y !== target.scrollTop); })) close(false);
  }
  function show(trigger){
    if (destroyed) return;
    if (active === trigger){ close(true); return; }
    close(false); active = trigger;
    var details = trigger._deltaDetails;
    pop.replaceChildren(); pop.setAttribute('aria-label', 'Change details for ' + trigger._deltaLabel);
    var eyebrow = document.createElement('span'); eyebrow.className = 'delta-popover-label'; eyebrow.textContent = 'Δ  What changed'; pop.appendChild(eyebrow);
    var title = document.createElement('strong'); title.className = 'node-link-title'; title.textContent = trigger._deltaLabel; pop.appendChild(title);
    var dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'node-link-close';
    dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Close change details'); dismiss.addEventListener('click', function(){ close(true); }); pop.appendChild(dismiss);
    if (details.text){
      var note = document.createElement('div'); note.className = 'delta-popover-text'; note.innerHTML = proseMarkup(details.text); pop.appendChild(note);
    }
    details.links.forEach(function(link){
      var a = document.createElement('a'); a.className = 'nbacklink node-reference-link'; a.href = link.url;
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.label + ' ↗'; pop.appendChild(a);
    });
    trigger.setAttribute('aria-expanded', 'true'); pop.hidden = false;
    if (pop.showPopover) pop.showPopover();
    var rect = trigger.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    pop.style.left = Math.max(8, Math.min(vw - pop.offsetWidth - 8, rect.left + rect.width / 2 - pop.offsetWidth / 2)) + 'px';
    var top = rect.bottom + 8;
    if (top + pop.offsetHeight > vh - 8) top = rect.top - pop.offsetHeight - 8;
    pop.style.top = Math.max(8, top) + 'px';
    dismiss.focus({preventScroll:true});
    for (var ancestor = trigger; ancestor; ancestor = ancestor.parentElement || (ancestor.getRootNode && ancestor.getRootNode().host))
      scrollAtOpen.push({el:ancestor, x:ancestor.scrollLeft, y:ancestor.scrollTop});
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true); document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
  }
  triggers.forEach(function(trigger){
    trigger.setAttribute('aria-controls', pop.id);
    ['pointerdown', 'mousedown'].forEach(function(type){ listen(trigger, type, function(ev){ ev.stopPropagation(); }); });
    listen(trigger, 'click', function(ev){ ev.preventDefault(); ev.stopPropagation(); show(trigger); });
    listen(trigger, 'keydown', function(ev){
      if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); ev.stopPropagation(); show(trigger); }
    });
  });
  listen(pop, 'click', function(ev){ ev.stopPropagation(); });
  return {close:function(){ close(false); }, destroy:function(){
    close(false); destroyed = true; listeners.forEach(function(off){ off(); }); pop.remove();
  }};
}
