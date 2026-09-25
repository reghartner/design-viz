/* tour.flowview.js — first-run guided tour overlay for the standalone page.
   Config-driven (core/tour-model.js owns the pure logic; docs/tour.md owns
   the retargeting contract). Browser-only fragment, standalone bundle only.

   Design (approved "presenter cinema" mockups): dark scrim with a bright
   ring-lit hole over the real control, subtitle narration bottom-left, a
   segment timeline top-center, Back/Next/Skip, keyboard hints. The hole is
   deliberately click-through — the copy invites trying the spotlit control —
   so the dialog is non-modal (role=dialog without aria-modal). */

function wireTour(ctl, view, win, config, request){
  var doc = win.document;
  if (doc.body.classList.contains('dv-embed')) return null;
  if (!tourUsableConfig(config)) return null;
  /* the caller (boot) reads #tour= before the deep-link channel rewrites
     the hash; fall back to a live read for non-boot embedders */
  if (request === undefined) request = tourHashRequest(win.location.hash);

  function storageDone(){
    try { if (win.localStorage && win.localStorage.getItem(TOUR_STORAGE_KEY) === 'done') return true; }
    catch (ex) { /* storage denied: fall through to the cookie */ }
    try { return tourDoneFromCookie(doc.cookie); }
    catch (ex) { return false; }
  }
  function markDone(){
    try { if (win.localStorage) win.localStorage.setItem(TOUR_STORAGE_KEY, 'done'); }
    catch (ex) { /* storage denied */ }
    try { doc.cookie = TOUR_COOKIE_NAME + '=1;path=/;max-age=31536000;samesite=lax'; }
    catch (ex) { /* cookie denied: in-memory only, the tour re-offers next load */ }
  }

  /* ---- section + state resolution ---- */
  function sectionFor(step){
    var ds = step.diagramState;
    if (ds && ds.section != null){
      var key = String(ds.section);
      for (var i = 0; i < ctl.sections.length; i++){
        var sec = ctl.sections[i];
        if (String(sec.reference) === key ||
            (sec.aliases && sec.aliases.indexOf(key) >= 0)) return sec;
      }
      return null; /* named section missing: the step cannot resolve */
    }
    return ctl.steppers.length ? ctl.steppers[0] : (ctl.sections[0] || null);
  }
  function sharedSourceIndex(sp){
    /* Last source step shared by the first two paths — the merge zone. */
    var paths = sp.paths();
    if (paths.length < 2) return -1;
    var a = paths[0].indices, b = paths[1].indices, last = -1;
    for (var i = 0; i < b.length; i++) if (a.indexOf(b[i]) >= 0) last = b[i];
    return last;
  }
  function resolvePathId(sp, token){
    var paths = sp.paths();
    if (token === '@alt') return paths.length > 1 ? paths[1].id : null;
    for (var i = 0; i < paths.length; i++) if (paths[i].id === token) return token;
    return null;
  }
  function queryTarget(step, sec, target){
    var root = (target && target.within === 'page') ? view :
               (sec && sec.sectionEl ? sec.sectionEl : view);
    if (!target || typeof target.selector !== 'string') return null;
    try { return root.querySelector(target.selector) || view.querySelector(target.selector); }
    catch (ex) { return null; }
  }
  function probe(step){
    if ((step.kind || 'spot') !== 'spot') return true;
    var sec = sectionFor(step);
    if (step.diagramState && step.diagramState.section != null && !sec) return false;
    if (!queryTarget(step, sec, step.target)) return false;
    var ds = step.diagramState || {};
    var sp = sec && sec.stepper;
    if (ds.path != null){
      if (!sp || resolvePathId(sp, ds.path) == null) return false;
    }
    if (ds.step === '@shared'){
      if (!sp || sharedSourceIndex(sp) < 0) return false;
    }
    return true;
  }
  function applyDiagramState(sec, ds){
    if (!sec || !ds) return;
    /* Same order as the deep-link apply: view installs its visible-stop
       filter before the path, the path before the step. */
    if (ds.view != null && sec.presentation && sec.presentation.setView){
      if (!sec.presentation.setView(ds.view))
        sec.presentation.setView(sec.presentation.defaultView());
    }
    var sp = sec.stepper;
    if (!sp) return;
    var pathId = ds.path != null ? resolvePathId(sp, ds.path) : null;
    if (pathId != null && sp.selectPath) sp.selectPath(pathId);
    if (ds.mode === 'ambient'){ sp.enterAmbient(); return; }
    if (ds.mode === 'step' && sp.mode() !== 'step') sp.enterStep(false);
    if (ds.step === '@shared'){
      var src = sharedSourceIndex(sp);
      if (src >= 0) sp.jumpSource(src, pathId || undefined);
    } else if (ds.step != null){
      var idx = sp.stepIndexOf(ds.step);
      if (idx >= 0) sp.jump(idx); /* unresolved explicit step: stay in place */
    }
  }

  /* ---- overlay DOM ---- */
  var overlay = null, parts = null, active = false, raf = 0, observer = null;
  var persona = null, list = [], at = 0, restoreFocus = null;

  function el(tag, className, text){
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(className, label, onClick){
    var b = el('button', className, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function buildOverlay(){
    overlay = el('div', 'dv-tour');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Guided tour');
    var scrim = ['t', 'r', 'b', 'l'].map(function(side){
      var panel = el('div', 'dv-tour-scrim dv-tour-scrim-' + side);
      overlay.appendChild(panel);
      return panel;
    });
    var ring = el('div', 'dv-tour-ring'); overlay.appendChild(ring);
    var ring2 = el('div', 'dv-tour-ring2'); ring2.hidden = true; overlay.appendChild(ring2);
    var note = el('div', 'dv-tour-note'); note.hidden = true; overlay.appendChild(note);
    var timeline = el('div', 'dv-tour-timeline'); overlay.appendChild(timeline);
    var ui = el('div', 'dv-tour-ui');
    var eyebrow = el('div', 'dv-tour-eyebrow');
    var heading = el('h2', 'dv-tour-heading');
    var body = el('p', 'dv-tour-body');
    var narration = el('div', 'dv-tour-narration');
    narration.setAttribute('aria-live', 'polite');
    narration.appendChild(eyebrow); narration.appendChild(heading); narration.appendChild(body);
    var controls = el('div', 'dv-tour-controls');
    var back = button('dv-tour-btn dv-tour-back', 'Back', function(){ go(at - 1); });
    var next = button('dv-tour-btn dv-tour-next', 'Next', function(){ go(at + 1); });
    var skip = button('dv-tour-skip', 'Skip tour', function(){ finish(true); });
    controls.appendChild(back); controls.appendChild(next); controls.appendChild(skip);
    ui.appendChild(narration); ui.appendChild(controls);
    overlay.appendChild(ui);
    var chooser = el('div', 'dv-tour-card dv-tour-chooser'); chooser.hidden = true;
    overlay.appendChild(chooser);
    var hint = el('div', 'dv-tour-hint', '← → to move · Esc to skip');
    overlay.appendChild(hint);
    doc.body.appendChild(overlay);
    parts = {scrim: scrim, ring: ring, ring2: ring2, note: note, timeline: timeline,
             ui: ui, eyebrow: eyebrow, heading: heading, body: body,
             back: back, next: next, skip: skip, chooser: chooser, hint: hint};
  }
  function setHole(rect){
    var vw = win.innerWidth, vh = win.innerHeight;
    var s = parts.scrim;
    s[0].style.cssText = 'left:0;top:0;width:' + vw + 'px;height:' + Math.max(0, rect.y) + 'px';
    s[1].style.cssText = 'left:' + (rect.x + rect.w) + 'px;top:' + rect.y + 'px;width:' +
      Math.max(0, vw - rect.x - rect.w) + 'px;height:' + rect.h + 'px';
    s[2].style.cssText = 'left:0;top:' + (rect.y + rect.h) + 'px;width:' + vw + 'px;height:' +
      Math.max(0, vh - rect.y - rect.h) + 'px';
    s[3].style.cssText = 'left:0;top:' + rect.y + 'px;width:' + Math.max(0, rect.x) + 'px;height:' + rect.h + 'px';
    if (rect.w > 0 && rect.h > 0){
      parts.ring.hidden = false;
      parts.ring.style.cssText = 'left:' + rect.x + 'px;top:' + rect.y + 'px;width:' +
        rect.w + 'px;height:' + rect.h + 'px';
    } else parts.ring.hidden = true;
  }
  function fullScrim(){ setHole({x: 0, y: 0, w: 0, h: 0}); parts.ring.hidden = true; }
  function viewport(){ return {w: win.innerWidth, h: win.innerHeight}; }
  function rectOf(node){
    var r = node.getBoundingClientRect();
    return {x: r.left, y: r.top, w: r.width, h: r.height};
  }
  function position(){
    if (!active) return;
    var step = list[at];
    if (!step || (step.kind || 'spot') !== 'spot'){ fullScrim(); return; }
    var sec = sectionFor(step);
    var target = queryTarget(step, sec, step.target);
    if (!target){ fullScrim(); return; }
    var rect = rectOf(target);
    /* the links step spotlights the whole node card, not the tiny trigger */
    if (step.target.selector.indexOf('nrefs-trigger') >= 0){
      var nodeEl = target.closest ? target.closest('.node[data-dv-node]') : null;
      if (nodeEl && nodeEl.getBoundingClientRect) rect = rectOf(nodeEl);
      var pop = doc.querySelector('.node-link-menu:not([hidden])');
      if (pop){
        var pr = rectOf(pop);
        var x2 = Math.max(rect.x + rect.w, pr.x + pr.w), y2 = Math.max(rect.y + rect.h, pr.y + pr.h);
        rect.x = Math.min(rect.x, pr.x); rect.y = Math.min(rect.y, pr.y);
        rect.w = x2 - rect.x; rect.h = y2 - rect.y;
      }
    }
    setHole(tourCutoutRect(rect, step.offset, 8, viewport()));
    if (step.secondary && step.secondary.target){
      var second = queryTarget(step, sec, step.secondary.target);
      if (second){
        var r2 = tourCutoutRect(rectOf(second), null, 6, viewport());
        parts.ring2.hidden = false;
        parts.ring2.style.cssText = 'left:' + r2.x + 'px;top:' + r2.y + 'px;width:' + r2.w + 'px;height:' + r2.h + 'px';
        parts.note.hidden = false;
        parts.note.textContent = step.secondary.note || '';
        var noteX = Math.max(16, Math.min(r2.x + r2.w - 260, win.innerWidth - 276));
        parts.note.style.cssText = 'left:' + noteX + 'px;top:' + (r2.y + r2.h + 10) + 'px';
        return;
      }
    }
    parts.ring2.hidden = true; parts.note.hidden = true;
  }
  function schedule(){
    if (raf) return;
    raf = win.requestAnimationFrame ? win.requestAnimationFrame(function(){ raf = 0; position(); }) :
          (position(), 0);
  }
  function watch(target){
    unwatch();
    if (win.ResizeObserver && target){
      observer = new win.ResizeObserver(schedule);
      observer.observe(target);
    }
  }
  function unwatch(){ if (observer){ observer.disconnect(); observer = null; } }

  /* ---- timeline + narration ---- */
  function renderTimeline(){
    var tl = tourTimeline(list, at);
    parts.timeline.replaceChildren();
    if (!tl.total || (list[at] && (list[at].kind || 'spot') === 'chooser')){
      parts.timeline.hidden = true; return;
    }
    parts.timeline.hidden = false;
    for (var i = 1; i <= tl.total; i++){
      var seg = el('span', 'dv-tour-seg' + (i <= tl.current ? ' on' : ''));
      parts.timeline.appendChild(seg);
    }
    parts.timeline.appendChild(el('span', 'dv-tour-count', tl.current + ' / ' + tl.total));
  }
  function renderChooser(step){
    parts.chooser.hidden = false;
    parts.ui.hidden = true;
    parts.chooser.replaceChildren();
    var copy = step.copy || {};
    if (copy.eyebrow) parts.chooser.appendChild(el('div', 'dv-tour-eyebrow', copy.eyebrow));
    parts.chooser.appendChild(el('h2', 'dv-tour-heading', copy.heading || 'Take the tour?'));
    if (copy.body) parts.chooser.appendChild(el('p', 'dv-tour-body', copy.body));
    var row = el('div', 'dv-tour-choices');
    (copy.choices || [{persona: 'both', label: 'Show me around', sub: ''}]).forEach(function(choice){
      var b = button('dv-tour-choice', '', function(){ choose(choice.persona); });
      b.appendChild(el('span', 'dv-tour-choice-label', choice.label || choice.persona));
      if (choice.sub) b.appendChild(el('span', 'dv-tour-choice-sub', choice.sub));
      row.appendChild(b);
    });
    parts.chooser.appendChild(row);
    var foot = el('div', 'dv-tour-choice-foot');
    if (copy.note) foot.appendChild(el('span', 'dv-tour-choice-note', copy.note));
    foot.appendChild(button('dv-tour-skip', 'Skip', function(){ finish(true); }));
    parts.chooser.appendChild(foot);
    var first = row.querySelector('button');
    if (first) first.focus();
  }
  function renderStep(step, keepFocus){
    parts.chooser.hidden = true;
    parts.ui.hidden = false;
    var copy = step.copy || {};
    var tl = tourTimeline(list, at);
    parts.eyebrow.textContent = copy.eyebrow ||
      ('TOUR · STEP ' + tl.current + ' OF ' + tl.total);
    parts.heading.textContent = copy.heading || '';
    parts.body.textContent = copy.body || '';
    parts.back.disabled = at === 0;
    parts.next.textContent = at >= list.length - 1 ? 'Done' : 'Next';
    /* the node-link menu closes on focus moving outside it, so the links
       step leaves focus where the engine put it (the menu's first link) */
    if (!keepFocus){
      try { parts.next.focus({preventScroll: true}); }
      catch (ex) { parts.next.focus(); }
    }
  }

  /* ---- state machine ---- */
  function buildList(){
    var steps = tourStepsForPersona(config, persona || 'both');
    if (persona == null)
      steps = steps.filter(function(step){ return (step.kind || 'spot') === 'chooser'; })
        .concat(steps.filter(function(step){ return (step.kind || 'spot') !== 'chooser'; }));
    var resolved = {};
    steps.forEach(function(step){ resolved[step.id] = probe(step); });
    return tourFilterResolved(steps, resolved);
  }
  function choose(which){
    persona = TOUR_PERSONAS.indexOf(which) >= 0 ? which : 'both';
    list = buildList();
    var next = 0;
    while (next < list.length && (list[next].kind || 'spot') === 'chooser') next++;
    go(next);
  }
  function go(index){
    if (index < 0) index = 0;
    if (index >= list.length){ finish(false); return; }
    at = index;
    var step = list[at];
    unwatch();
    if ((step.kind || 'spot') === 'chooser'){
      fullScrim(); renderTimeline(); renderChooser(step); return;
    }
    if ((step.kind || 'spot') === 'done'){
      fullScrim(); renderTimeline(); renderStep(step);
      parts.ui.classList.add('dv-tour-ui-center');
      return;
    }
    parts.ui.classList.remove('dv-tour-ui-center');
    var sec = sectionFor(step);
    if (sec && sec.tabBlock != null && sec.tab != null){
      for (var i = 0; i < ctl.tabBlocks.length; i++)
        if (ctl.tabBlocks[i].index === sec.tabBlock){
          ctl.tabBlocks[i].select(sec.tab, false, false);
          break;
        }
    }
    applyDiagramState(sec, step.diagramState);
    var target = queryTarget(step, sec, step.target);
    if (target && target.scrollIntoView){
      try { target.scrollIntoView({block: 'center', behavior: 'instant'}); }
      catch (ex) { target.scrollIntoView(); }
    }
    /* the links step opens the node menu so its rows are really on screen;
       the engine owns dismissal (outside pointer, Escape, scroll) */
    var menuOpened = false;
    if (target && step.target.selector.indexOf('nrefs-trigger') >= 0){
      try {
        target.dispatchEvent(new win.MouseEvent('click', {bubbles: true, cancelable: true}));
        menuOpened = !!doc.querySelector('.node-link-menu:not([hidden])');
      }
      catch (ex) { /* menu stays closed; the node alone is spotlit */ }
    }
    renderTimeline(); renderStep(step, menuOpened);
    watch(target);
    position();
    /* boards settle async (fonts, panel layout): measure again next frame */
    schedule();
  }
  function keydown(ev){
    if (!active) return;
    if (ev.target && ev.target.closest &&
        (ev.target.closest('.prose-code') || ev.target.closest('input, textarea, select'))) return;
    if (ev.key === 'Escape'){
      /* an open node-link menu owns its own Escape (engine, capture) */
      if (doc.querySelector('.node-link-menu:not([hidden])')) return;
      finish(true); ev.preventDefault(); return;
    }
    if (!parts.chooser.hidden) return; /* chooser: only Escape shortcuts apply */
    if (ev.key === 'ArrowRight'){ go(at + 1); ev.preventDefault(); }
    else if (ev.key === 'ArrowLeft'){ go(at - 1); ev.preventDefault(); }
    else if (ev.key === 'Tab' && overlay.contains(ev.target)){
      var focusable = overlay.querySelectorAll('button:not([disabled])');
      if (focusable.length){
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (ev.shiftKey && ev.target === first){ last.focus(); ev.preventDefault(); }
        else if (!ev.shiftKey && ev.target === last){ first.focus(); ev.preventDefault(); }
      }
    }
  }
  function start(){
    if (active) return;
    restoreFocus = doc.activeElement;
    if (!overlay) buildOverlay();
    overlay.hidden = false;
    active = true;
    persona = null;
    list = buildList();
    at = 0;
    if (!list.length){ finish(false); return; }
    if ((list[0].kind || 'spot') !== 'chooser'){ persona = 'both'; list = buildList(); }
    doc.addEventListener('keydown', keydown, true);
    win.addEventListener('resize', schedule);
    doc.addEventListener('scroll', schedule, true);
    doc.addEventListener('fullscreenchange', schedule);
    go(0);
  }
  function finish(skipped){
    if (!active) return;
    active = false;
    markDone();
    unwatch();
    doc.removeEventListener('keydown', keydown, true);
    win.removeEventListener('resize', schedule);
    doc.removeEventListener('scroll', schedule, true);
    doc.removeEventListener('fullscreenchange', schedule);
    if (overlay) overlay.hidden = true;
    if (restoreFocus && restoreFocus.isConnected && restoreFocus.focus) restoreFocus.focus();
    else if (replay && replay.isConnected) replay.focus();
  }

  /* ---- replay affordance + autostart ---- */
  var replay = doc.createElement('button');
  replay.type = 'button';
  replay.className = 'tbtn dv-tour-replay';
  replay.textContent = '?';
  replay.setAttribute('aria-label', 'Replay the tour');
  replay.addEventListener('click', function(){ start(); });
  var present = view.querySelector('.presentbtn');
  if (present && present.parentNode === view) view.insertBefore(replay, present.nextSibling);
  else view.insertBefore(replay, view.firstChild);

  win.dvStartTour = function(){ start(); return true; };

  if (request === 'force') start();
  else if (request !== 'suppress' && !storageDone()) start();

  return {start: start, active: function(){ return active; }};
}
