/* tour.flowview.js — first-run guided tour overlay for the standalone page.
   Config-driven (core/tour-model.js owns the pure logic; docs/tour.md owns
   the retargeting contract). Browser-only fragment, standalone bundle only.

   Design (approved "presenter cinema" mockups): dark scrim with a bright
   ring-lit hole over the real control, subtitle narration in a corner card,
   a segment timeline top-center, Back/Next/Skip, keyboard hints. The hole is
   deliberately click-through — the copy invites trying the spotlit control —
   so the dialog is non-modal (role=dialog without aria-modal).

   Safety posture: the tour is decoration around a working page. It never
   auto-starts over a shared deep link, it suppresses fragment writes while
   it drives the page and restores the pre-tour state afterwards, and any
   internal error tears the overlay down (fail-open) rather than leaving a
   scrim over the content. */

function wireTour(ctl, view, win, config, options){
  var doc = win.document;
  if (doc.body.classList.contains('dv-embed')) return null;
  if (!tourUsableConfig(config)) return null;
  options = options || {};
  var request = options.request !== undefined ? options.request :
    tourHashRequest(win.location.hash);

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
    /* within:"section" is strict — a selector never leaks into other
       sections or hidden tabs (majors: a page-wide fallback here matched
       controls the step was not about) */
    var root = (target && target.within === 'page') ? view :
               (sec && sec.sectionEl ? sec.sectionEl : null);
    if (!root || !target || typeof target.selector !== 'string') return null;
    try { return root.querySelector(target.selector); }
    catch (ex) { return null; }
  }
  function isRendered(el){
    try { return !!(el && el.getClientRects && el.getClientRects().length); }
    catch (ex) { return false; }
  }
  function selectSectionTab(sec){
    if (!sec || sec.tabBlock == null || sec.tab == null) return;
    for (var i = 0; i < ctl.tabBlocks.length; i++)
      if (ctl.tabBlocks[i].index === sec.tabBlock){
        if (ctl.tabBlocks[i].active() !== sec.tab)
          ctl.tabBlocks[i].select(sec.tab, false, false);
        break;
      }
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
    if (ds.path != null && pathId == null && win.console)
      console.warn('flowspec: tour diagramState.path "' + ds.path + '" not found — check the tour config for this diagram');
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

  /* ---- pre-tour state snapshot: the page must come back exactly ---- */
  var snapshot = null, openedDetails = [];
  function takeSnapshot(){
    snapshot = {
      scrollY: win.scrollY || 0,
      tabs: ctl.tabBlocks.map(function(tb){ return {index: tb.index, tab: tb.active()}; }),
      sections: ctl.sections.filter(function(sec){ return sec.stepper; }).map(function(sec){
        var sp = sec.stepper;
        var cur = sp.current();
        return {number: sec.number, mode: sp.mode(), path: sp.path(),
                step: cur ? cur.id : null, /* authored id, may be null */
                stepIndex: cur ? cur.n : 0,
                playing: sp.playing ? sp.playing() : false,
                view: sec.presentation && sec.presentation.viewId ? sec.presentation.viewId() : null};
      })
    };
    openedDetails = [];
  }
  function restoreSnapshot(){
    if (!snapshot) return;
    openedDetails.forEach(function(d){ if (d && d.isConnected) d.open = false; });
    openedDetails = [];
    snapshot.tabs.forEach(function(saved){
      for (var i = 0; i < ctl.tabBlocks.length; i++)
        if (ctl.tabBlocks[i].index === saved.index && ctl.tabBlocks[i].active() !== saved.tab)
          ctl.tabBlocks[i].select(saved.tab, false, false);
    });
    snapshot.sections.forEach(function(saved){
      var sec = null;
      for (var i = 0; i < ctl.sections.length; i++)
        if (ctl.sections[i].number === saved.number){ sec = ctl.sections[i]; break; }
      if (!sec || !sec.stepper) return;
      var sp = sec.stepper;
      /* Restore ONLY what actually changed: driving an untouched diagram
         through selectPath/enterAmbient is not a neutral round trip (it can
         mark hidden chips current and stop autoplay). Field-by-field. */
      var cur = sp.current();
      var touched = false;
      var liveView = sec.presentation && sec.presentation.viewId ? sec.presentation.viewId() : null;
      if (saved.view != null && liveView !== saved.view && sec.presentation && sec.presentation.setView){
        sec.presentation.setView(saved.view); touched = true;
      }
      if (saved.path != null && sp.path() !== saved.path && sp.selectPath){
        sp.selectPath(saved.path); touched = true;
      }
      if (saved.mode === 'step'){
        if (sp.mode() !== 'step'){ sp.enterStep(false); touched = true; }
        var idx = saved.step != null ? sp.stepIndexOf(saved.step) : -1;
        if (idx < 0 && saved.stepIndex >= 0 && saved.stepIndex < sp.ids().length)
          idx = saved.stepIndex; /* pages without authored step ids */
        /* cur is pre-restore: trust it only when nothing above moved */
        if (idx >= 0 && (touched || !(cur && cur.n === idx))) sp.jump(idx);
      } else if (saved.mode === 'ambient' && sp.mode() !== 'ambient') sp.enterAmbient();
      /* a diagram that was auto-playing keeps (or regains) its playback */
      if (saved.playing && sp.playing && !sp.playing() && sp.mode() === 'step') sp.toggleAuto();
    });
    win.scrollTo(0, snapshot.scrollY);
    snapshot = null;
  }

  /* ---- overlay DOM ---- */
  var overlay = null, parts = null, active = false, raf = 0, observer = null;
  var persona = null, list = [], at = 0, restoreFocus = null, disabled = false;
  var demoTimer = null, demoLeft = 0;

  function el(tag, className, text){
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(className, label, onClick){
    var b = el('button', className, label);
    b.type = 'button';
    b.addEventListener('click', function(){ stopDemo(); guarded(onClick); });
    return b;
  }
  /* fail-open: any tour error tears the overlay down and leaves the page
     usable; the tour stays off for this load only (config authors see the
     console warning; a fixed config works on the next load) */
  function guarded(fn){
    try { fn(); }
    catch (ex){
      if (win.console) console.warn('flowspec: tour error — ' + (ex && ex.message) + ' — tour dismissed');
      teardown();
    }
  }
  function teardown(){
    disabled = true;
    stopDemo();
    detach();
    if (snapshot){ try { restoreSnapshot(); } catch (ex) { snapshot = null; } }
    ctl.suppressFragmentWrites = false;
    active = false;
    if (overlay) overlay.hidden = true;
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
    var extras = el('div', 'dv-tour-extras'); overlay.appendChild(extras);
    var timeline = el('div', 'dv-tour-timeline'); overlay.appendChild(timeline);
    var ui = el('div', 'dv-tour-ui');
    var eyebrow = el('div', 'dv-tour-eyebrow');
    var heading = el('h2', 'dv-tour-heading');
    var body = el('p', 'dv-tour-body');
    var narration = el('div', 'dv-tour-narration');
    narration.id = 'dv-tour-narration';
    narration.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-describedby', 'dv-tour-narration');
    narration.appendChild(eyebrow); narration.appendChild(heading); narration.appendChild(body);
    var controls = el('div', 'dv-tour-controls');
    var back = button('dv-tour-btn dv-tour-back', 'Back', function(){ go(at - 1); });
    var next = button('dv-tour-btn dv-tour-next', 'Next', function(){ go(at + 1); });
    var skip = button('dv-tour-skip', 'Skip tour', function(){ finish(); });
    controls.appendChild(back); controls.appendChild(next); controls.appendChild(skip);
    ui.appendChild(narration); ui.appendChild(controls);
    overlay.appendChild(ui);
    var chooser = el('div', 'dv-tour-card dv-tour-chooser'); chooser.hidden = true;
    overlay.appendChild(chooser);
    var hint = el('div', 'dv-tour-hint', '← → to move · Esc to skip');
    overlay.appendChild(hint);
    doc.body.appendChild(overlay);
    parts = {scrim: scrim, ring: ring, extras: extras, timeline: timeline,
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
    if (rect.w > 4 && rect.h > 4){
      parts.ring.hidden = false;
      parts.ring.style.cssText = 'left:' + rect.x + 'px;top:' + rect.y + 'px;width:' +
        rect.w + 'px;height:' + rect.h + 'px';
    } else parts.ring.hidden = true;
  }
  function fullScrim(){
    setHole({x: 0, y: 0, w: 0, h: 0});
    parts.ring.hidden = true;
    parts.extras.replaceChildren();
    placeUi(null);
  }
  /* the narration card defaults to the bottom-left corner and yields to the
     spotlight: first corner that does not overlap the hole wins */
  function placeUi(hole){
    if (parts.ui.classList.contains('dv-tour-ui-center')){
      parts.ui.style.left = ''; parts.ui.style.top = '';
      parts.ui.style.right = ''; parts.ui.style.bottom = '';
      return;
    }
    var m = 44, uw = parts.ui.offsetWidth || 360, uh = parts.ui.offsetHeight || 200;
    var vw = win.innerWidth, vh = win.innerHeight;
    var corners = [
      {x: m, y: vh - m - uh}, {x: vw - m - uw, y: vh - m - uh},
      {x: m, y: m + 40}, {x: vw - m - uw, y: m + 40}
    ];
    var pick = corners[0];
    if (hole && hole.w > 0){
      for (var i = 0; i < corners.length; i++){
        var c = corners[i];
        var clear = c.x + uw < hole.x || c.x > hole.x + hole.w ||
                    c.y + uh < hole.y || c.y > hole.y + hole.h;
        if (clear){ pick = c; break; }
      }
    }
    parts.ui.style.left = pick.x + 'px';
    parts.ui.style.top = pick.y + 'px';
    parts.ui.style.right = 'auto';
    parts.ui.style.bottom = 'auto';
  }
  function viewport(){ return {w: win.innerWidth, h: win.innerHeight}; }
  function rectOf(node){
    var r = node.getBoundingClientRect();
    return {x: r.left, y: r.top, w: r.width, h: r.height};
  }
  function recenter(spot){
    var sr = spot.getBoundingClientRect();
    var vh = win.innerHeight;
    if (sr.top < 80 || sr.bottom > vh - 80)
      win.scrollTo(0, win.scrollY + sr.top - (vh - sr.height) / 2);
  }
  /* `secondary` accepts one callout or a list of them */
  function secondariesOf(value){
    if (value == null) return [];
    return (Array.isArray(value) ? value : [value]).filter(function(item){
      return !!item && typeof item === 'object' && item.target;
    });
  }
  /* a demo step under reduced motion swaps its spotlight to the transport so
     the visitor advances the story with the real controls */
  function effectiveTargets(step){
    if (step.demo && RM)
      return {target: {selector: '.step-transport', within: 'section'},
              secondaries: [{target: step.target, note: ''}].concat(secondariesOf(step.secondary))};
    return {target: step.target, secondaries: secondariesOf(step.secondary)};
  }
  function position(){
    if (!active) return;
    var step = list[at];
    if (!step || (step.kind || 'spot') !== 'spot'){ fullScrim(); return; }
    var sec = sectionFor(step);
    var eff = effectiveTargets(step);
    var target = queryTarget(step, sec, eff.target);
    if (!target || !isRendered(target)){ fullScrim(); return; }
    var rect = rectOf(target);
    /* the links step spotlights the whole node card, not the tiny trigger;
       the menu itself is the viewer's click — the engine popover paints in
       the browser top layer, above this overlay */
    if (eff.target.selector.indexOf('nrefs-trigger') >= 0){
      var nodeEl = target.closest ? target.closest('.node[data-dv-node]') : null;
      if (nodeEl && nodeEl.getBoundingClientRect) rect = rectOf(nodeEl);
    }
    var hole = tourCutoutRect(rect, step.offset, 8, viewport());
    setHole(hole);
    placeUi(hole);
    /* every control the copy names carries its own thin ring */
    parts.extras.replaceChildren();
    eff.secondaries.forEach(function(item){
      var second = queryTarget(step, sec, item.target);
      if (!second || !isRendered(second)) return;
      var r2 = tourCutoutRect(rectOf(second), null, 6, viewport());
      var ring2 = el('div', 'dv-tour-ring2');
      ring2.style.cssText = 'left:' + r2.x + 'px;top:' + r2.y + 'px;width:' + r2.w + 'px;height:' + r2.h + 'px';
      parts.extras.appendChild(ring2);
      var noteText = item.note || '';
      if (noteText){
        var note = el('div', 'dv-tour-note', noteText);
        var noteX = Math.max(16, Math.min(r2.x + r2.w - 260, win.innerWidth - 276));
        note.style.cssText = 'left:' + noteX + 'px;top:' + (r2.y + r2.h + 10) + 'px';
        parts.extras.appendChild(note);
      }
    });
  }
  function schedule(){
    if (raf) return;
    raf = win.requestAnimationFrame ? win.requestAnimationFrame(function(){ raf = 0; guarded(position); }) :
          (guarded(position), 0);
  }
  function watch(target){
    unwatch();
    if (win.ResizeObserver && target){
      observer = new win.ResizeObserver(schedule);
      observer.observe(target);
    }
  }
  function unwatch(){ if (observer){ observer.disconnect(); observer = null; } }

  /* ---- playback demo (step.demo): the panels change while the ring holds ---- */
  function stopDemo(){
    if (demoTimer){ win.clearTimeout(demoTimer); demoTimer = null; }
    demoLeft = 0;
  }
  function startDemo(step, sec){
    stopDemo();
    if (!step.demo || RM || !sec || !sec.stepper) return;
    var advance = Math.max(1, Math.min(30, Number(step.demo.advance) || 3));
    var interval = Math.max(400, Math.min(10000, Number(step.demo.intervalMs) || 1800));
    /* the demo is a little story: always play it from the path's first
       visible stop, wherever the diagram sat when the step opened */
    var sp = sec.stepper;
    if (sp.mode() !== 'step') sp.enterStep(false);
    sp.jump(0);
    schedule();
    demoLeft = advance;
    var tick = function(){
      demoTimer = null;
      if (!active || list[at] !== step || demoLeft <= 0) return;
      if (sp.mode() !== 'step') sp.enterStep(false);
      sp.advance(sp.current().n + 1);
      demoLeft--;
      schedule();
      if (demoLeft > 0) demoTimer = win.setTimeout(tick, interval);
    };
    demoTimer = win.setTimeout(tick, interval);
  }

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
  function chooserChoices(copy){
    var raw = Array.isArray(copy.choices) ? copy.choices : [];
    var safe = raw.filter(function(choice){
      return !!choice && typeof choice === 'object' && !Array.isArray(choice);
    });
    return safe.length ? safe : [{persona: 'both', label: 'Show me around', sub: ''}];
  }
  function renderChooser(step){
    parts.chooser.hidden = false;
    parts.ui.hidden = true;
    parts.chooser.replaceChildren();
    var copy = (step.copy && typeof step.copy === 'object') ? step.copy : {};
    if (copy.eyebrow) parts.chooser.appendChild(el('div', 'dv-tour-eyebrow', String(copy.eyebrow)));
    parts.chooser.appendChild(el('h2', 'dv-tour-heading', String(copy.heading || 'Take the tour?')));
    if (copy.body) parts.chooser.appendChild(el('p', 'dv-tour-body', String(copy.body)));
    var row = el('div', 'dv-tour-choices');
    chooserChoices(copy).forEach(function(choice){
      var b = button('dv-tour-choice', '', function(){ choose(choice.persona); });
      b.appendChild(el('span', 'dv-tour-choice-label', String(choice.label || choice.persona || 'Continue')));
      if (choice.sub) b.appendChild(el('span', 'dv-tour-choice-sub', String(choice.sub)));
      row.appendChild(b);
    });
    parts.chooser.appendChild(row);
    var foot = el('div', 'dv-tour-choice-foot');
    if (copy.note) foot.appendChild(el('span', 'dv-tour-choice-note', String(copy.note)));
    foot.appendChild(button('dv-tour-skip', 'Skip', function(){ finish(); }));
    parts.chooser.appendChild(foot);
    var first = row.querySelector('button');
    if (first) first.focus();
  }
  function renderStep(step){
    parts.chooser.hidden = true;
    parts.ui.hidden = false;
    var copy = (step.copy && typeof step.copy === 'object') ? step.copy : {};
    var tl = tourTimeline(list, at);
    parts.eyebrow.textContent = copy.eyebrow != null ? String(copy.eyebrow) :
      ('TOUR · STEP ' + tl.current + ' OF ' + tl.total);
    parts.heading.textContent = String(copy.heading || '');
    parts.body.textContent = String(copy.body || '') +
      /* under reduced motion the engine disables ▶ too — the arrows remain */
      (step.demo && RM ? ' Auto-play is off — use the ‹ › step arrows to walk the story yourself.' : '');
    parts.back.disabled = at === 0;
    parts.next.textContent = at >= list.length - 1 ? 'Done' : 'Next';
    try { parts.next.focus({preventScroll: true}); }
    catch (ex) { parts.next.focus(); }
  }

  /* ---- state machine ---- */
  /* The list is the authored config filtered by persona — nothing else.
     Whether a step's control exists is settled at entry, where applying the
     step's own tab and diagram state has already revealed it; a miss is an
     authoring bug, surfaced as a console warning and passed through. */
  function buildList(){
    var steps = tourStepsForPersona(config, persona || 'both');
    /* one chooser, always first; extras are dropped (lint warns) */
    var choosers = steps.filter(function(step){ return (step.kind || 'spot') === 'chooser'; });
    return choosers.slice(0, 1).concat(steps.filter(function(step){
      return (step.kind || 'spot') !== 'chooser';
    }));
  }
  function choose(which){
    persona = TOUR_PERSONAS.indexOf(which) >= 0 ? which : 'both';
    list = buildList();
    var next = 0;
    while (next < list.length && (list[next].kind || 'spot') === 'chooser') next++;
    go(next);
  }
  function go(index){
    stopDemo();
    var dir = index >= at ? 1 : -1;
    var from = at;
    var step = null, sec = null, eff = null, target = null;
    /* Entry-time resolution: entering a step applies its authored tab and
       diagram state, which is what reveals its control (an ambient-hidden
       transport, a panel in another tab). A control still missing or
       unrendered then is an authoring bug: warn and pass through in the
       walking direction — the timeline keeps the authored numbering. */
    for (;;){
      if (index >= list.length){ finish(); return; }
      if (index < 0){ index = from; dir = 1; } /* nothing enterable behind: stay */
      step = list[index];
      if ((step.kind || 'spot') !== 'spot') break;
      sec = sectionFor(step);
      if (step.diagramState && step.diagramState.section != null && !sec){
        if (win.console) console.warn('flowspec: tour step "' + step.id +
          '" target not found — check the tour config for this diagram');
        index += dir; continue;
      }
      selectSectionTab(sec);
      applyDiagramState(sec, step.diagramState);
      eff = effectiveTargets(step);
      target = queryTarget(step, sec, eff.target);
      if (target){
        /* a collapsed disclosure hides its content until opened — disclose
           before judging visibility, exactly as the viewer would */
        for (var anc = target; anc && anc !== doc.body; anc = anc.parentElement || (anc.getRootNode && anc.getRootNode().host))
          if (anc.tagName === 'DETAILS' && !anc.open){ anc.open = true; openedDetails.push(anc); }
      }
      if (!target || !isRendered(target)){
        if (win.console) console.warn('flowspec: tour step "' + step.id +
          '" target not found — check the tour config for this diagram');
        index += dir; continue;
      }
      break;
    }
    at = index;
    unwatch();
    parts.hint.hidden = (step.kind || 'spot') === 'chooser'; /* arrows do nothing there */
    if ((step.kind || 'spot') === 'chooser'){
      parts.ui.classList.remove('dv-tour-ui-center');
      fullScrim(); renderTimeline(); renderChooser(step); return;
    }
    if ((step.kind || 'spot') === 'done'){
      parts.ui.classList.add('dv-tour-ui-center');
      fullScrim(); renderTimeline(); renderStep(step);
      return;
    }
    parts.ui.classList.remove('dv-tour-ui-center');
    if (target){
      /* scrollIntoView first (it also centers inside the board's own
         horizontal scroller), then correct the window explicitly — on SVG
         children scrollIntoView may move only the inner scroller */
      var spot = eff.target.selector.indexOf('nrefs-trigger') >= 0 && target.closest ?
        (target.closest('.node[data-dv-node]') || target) : target;
      if (spot.scrollIntoView){
        try { spot.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}); }
        catch (ex) { spot.scrollIntoView(); }
      }
      recenter(spot);
      /* engine step-change scrolling and freshly disclosed boards settle
         asynchronously: keep correcting until the target rect is stable
         inside the viewport (or give up quietly after ~0.6s) */
      var settleTries = 8, lastTop = null;
      (function settle(){
        if (!active || list[at] !== step) return;
        recenter(spot); guarded(position);
        var top = Math.round(spot.getBoundingClientRect().top);
        var inView = top >= 0 && top <= win.innerHeight;
        if ((inView && top === lastTop) || --settleTries <= 0){
          if (inView) startDemo(step, sec);
          return;
        }
        lastTop = top;
        win.setTimeout(function(){ guarded(settle); }, 80);
      })();
    }
    renderTimeline(); renderStep(step);
    watch(target);
    guarded(position);
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
      stopDemo(); guarded(finish);
      ev.preventDefault(); ev.stopImmediatePropagation(); return;
    }
    if (!parts.chooser.hidden) return; /* chooser: only Escape shortcuts apply */
    if (ev.key === 'ArrowRight'){
      stopDemo(); guarded(function(){ go(at + 1); });
      /* the presenter's own arrow handler must never also advance the
         diagram while the tour owns the keys */
      ev.preventDefault(); ev.stopImmediatePropagation();
    } else if (ev.key === 'ArrowLeft'){
      stopDemo(); guarded(function(){ go(at - 1); });
      ev.preventDefault(); ev.stopImmediatePropagation();
    } else if (ev.key === 'Tab' && overlay.contains(ev.target)){
      var focusable = overlay.querySelectorAll('button:not([disabled])');
      if (focusable.length){
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (ev.shiftKey && ev.target === first){ last.focus(); ev.preventDefault(); }
        else if (!ev.shiftKey && ev.target === last){ first.focus(); ev.preventDefault(); }
      }
    }
  }
  function pagePointer(ev){
    /* touching the page through the hole (the spotlit control) takes over
       from a running demo, just like touching the tour's own controls */
    if (demoTimer && overlay && !overlay.contains(ev.target)) stopDemo();
  }
  function attach(){
    doc.addEventListener('keydown', keydown, true);
    doc.addEventListener('pointerdown', pagePointer, true);
    win.addEventListener('resize', schedule);
    doc.addEventListener('scroll', schedule, true);
    doc.addEventListener('fullscreenchange', schedule);
  }
  function detach(){
    unwatch();
    doc.removeEventListener('keydown', keydown, true);
    doc.removeEventListener('pointerdown', pagePointer, true);
    win.removeEventListener('resize', schedule);
    doc.removeEventListener('scroll', schedule, true);
    doc.removeEventListener('fullscreenchange', schedule);
  }
  function start(){
    if (active || disabled) return;
    restoreFocus = doc.activeElement;
    if (!overlay) buildOverlay();
    overlay.hidden = false;
    active = true;
    persona = null;
    fullScrim(); /* cover the page before state-aware probing touches it */
    takeSnapshot();
    ctl.suppressFragmentWrites = true;
    list = buildList();
    at = 0;
    if (!list.length){ finish(); return; }
    if ((list[0].kind || 'spot') !== 'chooser'){ persona = 'both'; list = buildList(); }
    attach();
    go(0);
  }
  function finish(){
    if (!active) return;
    active = false;
    stopDemo();
    markDone();
    detach();
    try { restoreSnapshot(); }
    catch (ex) { snapshot = null; }
    ctl.suppressFragmentWrites = false;
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
  replay.addEventListener('click', function(){ disabled = false; guarded(start); });
  var present = view.querySelector('.presentbtn');
  if (present && present.parentNode === view) view.insertBefore(replay, present.nextSibling);
  else view.insertBefore(replay, view.firstChild);

  win.dvStartTour = function(){ disabled = false; guarded(start); return true; };

  if (request === 'force') guarded(start);
  else if (request !== 'suppress' && !options.deepLink && !storageDone()) guarded(start);

  return {start: function(){ guarded(start); }, active: function(){ return active; }};
}
