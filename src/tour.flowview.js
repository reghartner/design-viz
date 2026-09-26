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
  function forkSourceIndex(sp){
    /* The last step of the first two paths' COMMON PREFIX — where they
       split. -1 when they share no opening step (disjoint paths, or a path
       that merges in without ever forking): then there is no split. */
    var paths = sp.paths();
    if (paths.length < 2) return -1;
    var a = paths[0].indices, b = paths[1].indices, last = -1, i = 0;
    for (; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) last = a[i];
    /* a fork only if the walk stopped at a real difference — a path that is
       a strict prefix of the other, or identical to it, never splits */
    return (i < a.length && i < b.length) ? last : -1;
  }
  function rejoinSourceIndex(sp){
    /* The alt path's FIRST own step whose successor is shared again — the
       earliest place a branch flows back, leaving the longest shared tail
       for the demo to walk. */
    var paths = sp.paths();
    if (paths.length < 2) return -1;
    var a = paths[0].indices, b = paths[1].indices;
    for (var i = 0; i < b.length - 1; i++)
      if (a.indexOf(b[i]) < 0 && a.indexOf(b[i + 1]) >= 0) return b[i];
    return -1;
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
    if (pathId != null && sp.selectPath) sp.selectPath(pathId);
    if (ds.mode === 'ambient'){ sp.enterAmbient(); return; }
    if (ds.mode === 'step' && sp.mode() !== 'step') sp.enterStep(false);
    if (ds.step === '@shared' || ds.step === '@rejoin' || ds.step === '@fork'){
      var src = ds.step === '@shared' ? sharedSourceIndex(sp) :
        ds.step === '@fork' ? forkSourceIndex(sp) : rejoinSourceIndex(sp);
      if (src >= 0) sp.jumpSource(src, pathId || undefined);
      /* unresolved tokens are entry failures, judged before this runs */
    } else if (ds.step != null){
      var idx = sp.stepIndexOf(ds.step);
      if (idx >= 0) sp.jump(idx); /* unresolved explicit step: stay in place */
    }
  }

  /* ---- pre-tour state snapshot: the page must come back exactly ---- */
  var snapshot = null, openedDetails = [];
  function takeSnapshot(){
    /* an open drill-down: save it and return to the overview so the tour
       walks the page from the top; it is restored exactly on finish */
    var drill = ctl.details ? ctl.details.snapshot() : null;
    if (drill){ ctl.details.close(true); ctl.detailHistoryPush = false; }
    snapshot = {
      drill: drill,
      activeTarget: ctl.activeTarget ? JSON.parse(JSON.stringify(ctl.activeTarget)) : null,
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
    /* drill state last: the tour always leaves the overview showing, so
       only a pre-tour drill needs re-opening (async, via the engine's own
       restore path; fragment writes stay suppressed until finish) */
    var drill = snapshot.drill;
    if (ctl.details){
      if (ctl.details.snapshot()) ctl.details.close(true);
      if (drill){ try { ctl.details.restore(drill); } catch (ex) { /* stays at overview */ } }
    }
    ctl.detailHistoryPush = false;
    /* the tour's own drill set activeTarget; the next user-driven fragment
       write must name the section the reader actually had */
    if (snapshot.activeTarget) ctl.activeTarget = snapshot.activeTarget;
    win.scrollTo(0, snapshot.scrollY);
    snapshot = null;
  }

  /* ---- overlay DOM ---- */
  var overlay = null, parts = null, active = false, raf = 0, observer = null, settling = false, gen = 0;
  var lastSection = null;
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
    settling = false;
    stopDemo();
    closeDemoClick();
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
    /* The dim is an SVG mask: a white full rect with one black rounded rect
       per hole. Overlapping holes stay black, so the un-dimmed region is
       exactly the union of the rounded rects — no merging, no squared-off
       strips. It never takes pointer events; click-blocking lives in a
       separate layer of axis-aligned rects covering the complement. */
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var maskId = 'dv-tour-mask-' + Math.random().toString(36).slice(2, 8);
    var dim = doc.createElementNS(SVG_NS, 'svg');
    dim.setAttribute('class', 'dv-tour-dim');
    dim.setAttribute('aria-hidden', 'true');
    var defs = doc.createElementNS(SVG_NS, 'defs');
    var mask = doc.createElementNS(SVG_NS, 'mask');
    mask.setAttribute('id', maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    var maskBase = doc.createElementNS(SVG_NS, 'rect');
    maskBase.setAttribute('fill', '#fff');
    mask.appendChild(maskBase);
    defs.appendChild(mask); dim.appendChild(defs);
    /* glow: a blur filter on a rect with the SAME shape as the ring */
    var glowId = 'dv-tour-glow-' + Math.random().toString(36).slice(2, 8);
    var glow = doc.createElementNS(SVG_NS, 'filter');
    glow.setAttribute('id', glowId);
    glow.setAttribute('x', '-50%'); glow.setAttribute('y', '-50%');
    glow.setAttribute('width', '200%'); glow.setAttribute('height', '200%');
    var blur = doc.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '6');
    glow.appendChild(blur); defs.appendChild(glow);
    var dimRect = doc.createElementNS(SVG_NS, 'rect');
    dimRect.setAttribute('class', 'dv-tour-dim-fill');
    dimRect.setAttribute('mask', 'url(#' + maskId + ')');
    dim.appendChild(dimRect);
    /* rings are drawn in the SAME svg, from the SAME shape objects as the
       mask holes (one geometry, one render path) */
    var rings = doc.createElementNS(SVG_NS, 'g');
    rings.setAttribute('class', 'dv-tour-rings');
    dim.appendChild(rings);
    overlay.appendChild(dim);
    var scrim = el('div', 'dv-tour-scrim');
    overlay.appendChild(scrim);
    var extras = el('div', 'dv-tour-extras'); overlay.appendChild(extras);
    /* a mouse way out that never waits for the card: fixed top-right from
       the first frame, above the click blockers, never moved */
    var exit = button('dv-tour-exit', 'Skip tour \u2715', function(){ finish(); });
    exit.setAttribute('aria-label', 'Skip the tour');
    overlay.appendChild(exit);
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
    parts = {scrim: scrim, dim: dim, mask: mask, maskBase: maskBase, dimRect: dimRect,
             rings: rings, glowId: glowId, extras: extras, timeline: timeline,
             ui: ui, eyebrow: eyebrow, heading: heading, body: body,
             back: back, next: next, skip: skip, chooser: chooser, hint: hint};
  }
  /* One geometry, one render path. Every highlight is a single shape
     object {x, y, width, height, rx}; that object writes the mask hole AND
     (for ringed highlights) the ring rect — identical attributes, so hole
     and ring cannot drift. The ring's 2px stroke is CENTERED on the hole
     edge (1px inside, 1px outside); its glow is a blurred wider stroke on
     a third rect with the same shape. The same list, in the same pass,
     produces the click-blocker cells, so no layer lags another.
       - visual: overlapping holes stay black in the mask, so the un-dimmed
         region is exactly the union of the rounded rects;
       - clicks: the complement of the union on the grid of distinct hole
         edges (a cell blocks iff its centre lies in no hole). Rounded
         corners resolve to the bounding rect for CLICKS only. */
  var SVGNS_DIM = 'http://www.w3.org/2000/svg';
  function shapeOf(h){
    var rx = Math.min(h.r || 0, h.w / 2, h.h / 2);
    return {x: h.x, y: h.y, width: h.w, height: h.h, rx: rx};
  }
  function setShape(node, s){
    node.setAttribute('x', s.x); node.setAttribute('y', s.y);
    node.setAttribute('width', s.width); node.setAttribute('height', s.height);
    node.setAttribute('rx', s.rx); node.setAttribute('ry', s.rx);
  }
  function svgRect(cls){
    var node = doc.createElementNS(SVGNS_DIM, 'rect');
    if (cls) node.setAttribute('class', cls);
    return node;
  }
  function render(highlights){
    var vw = win.innerWidth, vh = win.innerHeight;
    var visible = highlights.filter(function(h){ return h.w > 4 && h.h > 4; });
    var base = parts.maskBase;
    setShape(base, {x: 0, y: 0, width: vw, height: vh, rx: 0});
    setShape(parts.dimRect, {x: 0, y: 0, width: vw, height: vh, rx: 0});
    parts.dim.setAttribute('width', vw); parts.dim.setAttribute('height', vh);
    parts.dim.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
    while (parts.mask.lastChild && parts.mask.lastChild !== base) parts.mask.removeChild(parts.mask.lastChild);
    parts.rings.replaceChildren();
    parts.extras.replaceChildren();
    /* a ringed hole touching a viewport edge is inset 1px (half the 2px
       stroke) on THAT edge only, so the centered stroke stays fully on
       screen. The inset is applied to the highlight itself, before the
       shape is built, so hole, ring and blockers all keep one geometry;
       the cost is at most a 1px strip of target at a screen edge. */
    visible.forEach(function(h){
      if (h.kind === 'reveal') return;
      var x2 = Math.min(h.x + h.w, vw - 1), y2 = Math.min(h.y + h.h, vh - 1);
      h.x = Math.max(h.x, 1); h.y = Math.max(h.y, 1);
      h.w = x2 - h.x; h.h = y2 - h.y;
    });
    visible.forEach(function(h){
      var s = shapeOf(h);
      var hole = svgRect(null);
      setShape(hole, s); hole.setAttribute('fill', '#000');
      hole.setAttribute('data-kind', h.kind);
      parts.mask.appendChild(hole);
      if (h.kind === 'reveal') return;
      if (h.kind === 'primary'){
        var halo = svgRect('dv-tour-glow');
        setShape(halo, s); halo.setAttribute('filter', 'url(#' + parts.glowId + ')');
        parts.rings.appendChild(halo);
      }
      var ring = svgRect(h.kind === 'primary' ? 'dv-tour-ring' : 'dv-tour-ring2');
      setShape(ring, s);
      parts.rings.appendChild(ring);
      if (h.note){
        var note = el('div', 'dv-tour-note', h.note);
        var noteX = Math.max(16, Math.min(s.x + s.width - 260, vw - 276));
        note.style.cssText = 'left:' + noteX + 'px;top:' + (s.y + s.height + 10) + 'px';
        parts.extras.appendChild(note);
      }
    });
    /* hit-blocking: complement of the union on the edge grid */
    parts.scrim.replaceChildren();
    var xs = [0, vw], ys = [0, vh];
    visible.forEach(function(r){
      xs.push(Math.max(0, Math.min(vw, r.x)), Math.max(0, Math.min(vw, r.x + r.w)));
      ys.push(Math.max(0, Math.min(vh, r.y)), Math.max(0, Math.min(vh, r.y + r.h)));
    });
    function uniq(a){ return a.sort(function(p, q){ return p - q; }).filter(function(v, i, arr){ return i === 0 || v !== arr[i - 1]; }); }
    xs = uniq(xs); ys = uniq(ys);
    function covered(cx, cy){
      return visible.some(function(r){ return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h; });
    }
    for (var yi = 0; yi < ys.length - 1; yi++){
      var y0 = ys[yi], y1 = ys[yi + 1], runStart = null;
      for (var xi = 0; xi <= xs.length - 1; xi++){
        var blocked = xi < xs.length - 1 && !covered((xs[xi] + xs[xi + 1]) / 2, (y0 + y1) / 2);
        if (blocked && runStart === null) runStart = xs[xi];
        if (!blocked && runStart !== null){
          var cell = el('div', 'dv-tour-block');
          cell.style.cssText = 'left:' + runStart + 'px;top:' + y0 + 'px;width:' +
            (xs[xi] - runStart) + 'px;height:' + (y1 - y0) + 'px';
          parts.scrim.appendChild(cell);
          runStart = null;
        }
      }
    }
  }
  /* The narration card appears ONCE, in its final position: on every spot
     step it stays hidden (visibility only — still measurable) from entry
     until the step's final target is resolved and placed, then it is shown
     together with the rings. A click step's card waits through the
     cause-before-effect hold and appears beside the opened menu. */
  var focusOnShow = false;
  function holdCard(){ parts.ui.classList.add('dv-tour-ui-pending'); }
  function showCard(){
    if (!parts.ui.classList.contains('dv-tour-ui-pending')) return;
    parts.ui.classList.remove('dv-tour-ui-pending');
    if (focusOnShow && active) focusNext();
  }
  function fullScrim(){
    render([]);
    placeUi(null);
  }
  /* the narration card defaults to the bottom-left corner and yields to the
     spotlight: first corner that does not overlap the hole wins */
  /* Card placement, from the FINAL layout (rings and notes already drawn,
     card still held): candidates in a fixed order — bottom-left,
     bottom-right, top-left, top-right, bottom-centre, top-centre.
       1. the first candidate that covers no ring and no note;
       2. else the first candidate clear of the PRIMARY ring that covers the
          fewest secondary rings/notes;
       3. else (the primary spans every candidate) the candidate covering
          the least primary area.
     The rule that applied is written to data-placement (clear | partial |
     covers-primary) so it can be asserted; it never moves once shown. */
  function placeUi(primary){
    if (parts.ui.classList.contains('dv-tour-ui-center')){
      parts.ui.style.left = ''; parts.ui.style.top = '';
      parts.ui.style.right = ''; parts.ui.style.bottom = '';
      parts.ui.removeAttribute('data-placement');
      return;
    }
    var m = 44, uw = parts.ui.offsetWidth || 360, uh = parts.ui.offsetHeight || 200;
    var vw = win.innerWidth, vh = win.innerHeight;
    var cx = Math.max(m, (vw - uw) / 2);
    function spots(mg){
      return [
        {x: mg, y: vh - mg - uh}, {x: vw - mg - uw, y: vh - mg - uh},
        {x: mg, y: mg + 40}, {x: vw - mg - uw, y: mg + 40},
        {x: cx, y: vh - mg - uh}, {x: cx, y: mg + 40}
      ];
    }
    /* the comfortable 44px margin first, then the same six spots at 16px
       — a hair of extra room often clears a ring outright */
    var candidates = spots(m).concat(spots(16));
    function area(c, r){
      var w = Math.min(c.x + uw, r.x + r.w) - Math.max(c.x, r.x);
      var h = Math.min(c.y + uh, r.y + r.h) - Math.max(c.y, r.y);
      return (w > 0 && h > 0) ? w * h : 0;
    }
    var others = [];
    Array.prototype.forEach.call(parts.rings.querySelectorAll('.dv-tour-ring2'), function(n){
      var b = n.getBoundingClientRect(); others.push({x: b.left, y: b.top, w: b.width, h: b.height});
    });
    Array.prototype.forEach.call(parts.extras.querySelectorAll('.dv-tour-note'), function(n){
      var b = n.getBoundingClientRect(); others.push({x: b.left, y: b.top, w: b.width, h: b.height});
    });
    var pick = null, mode = 'clear';
    if (!primary || primary.w <= 0){ pick = candidates[0]; }
    for (var i = 0; !pick && i < candidates.length; i++){
      var c = candidates[i];
      if (!area(c, primary) && others.every(function(r){ return !area(c, r); })) pick = c;
    }
    if (!pick){
      /* least total AREA over secondary rings/notes (not the count): a
         3px graze beats covering a whole breadcrumb */
      var best = null, bestArea = Infinity;
      candidates.forEach(function(c){
        if (area(c, primary)) return;
        var covered = others.reduce(function(sum, r){ return sum + area(c, r); }, 0);
        if (covered < bestArea){ best = c; bestArea = covered; }
      });
      if (best){ pick = best; mode = 'partial'; }
    }
    if (!pick){
      var least = Infinity;
      candidates.forEach(function(c){ var a = area(c, primary); if (a < least){ least = a; pick = c; } });
      mode = 'covers-primary';
    }
    parts.ui.setAttribute('data-placement', mode);
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
  /* an advancing demo under reduced motion swaps its spotlight to the
     transport so the visitor walks the story with the real controls; a
     click demo is one discrete action and runs as authored */
  function effectiveTargets(step){
    if (step.demo && step.demo.advance != null && RM){
      var swapped = (step.target && step.target.selector !== '.step-transport') ?
        [{target: step.target, note: ''}] : [];
      return {target: {selector: '.step-transport', within: 'section'},
              secondaries: swapped.concat(secondariesOf(step.secondary))};
    }
    return {target: step.target, secondaries: secondariesOf(step.secondary)};
  }
  /* demo.click bookkeeping: the tour clicked a real control (the node-links
     trigger) to put something on screen; leaving the step un-clicks it via
     the engine's own toggle so nothing stays open behind the tour's back */
  var clickedTrigger = null, pendingClick = null;
  function closeDemoClick(){
    pendingClick = null;
    if (!clickedTrigger) return;
    var trigger = clickedTrigger;
    clickedTrigger = null;
    try {
      /* a drill-down trigger: return to the parent level through the
         engine's own silent close (no history entry, no fragment write) */
      if (trigger.getAttribute && trigger.hasAttribute('data-dv-detail')){
        if (ctl.details && ctl.details.snapshot()) ctl.details.close(true);
        ctl.detailHistoryPush = false;
        return;
      }
      /* a menu trigger: un-click through its own toggle, only if it is the
         one expanded */
      if (trigger.isConnected && trigger.getAttribute && trigger.getAttribute('aria-expanded') === 'true')
        trigger.dispatchEvent(new win.MouseEvent('click', {bubbles: true, cancelable: true}));
    } catch (ex) { /* nothing to close */ }
  }
  /* the click fires only after the settle loop has centered its control on
     stable layout: the engine's menu places itself near the trigger and
     dismisses itself on any later scroll, so the order is scroll → settle →
     click → ring the menu, never click-then-scroll */
  function firePendingClick(step, sec, eff){
    if (!pendingClick || !active || list[at] !== step) return;
    var el = pendingClick.el;
    pendingClick = null;
    /* the viewer may have clicked ⋯ themselves during the hold: clicking
       again would toggle the menu shut. Leave it open; it is theirs. */
    var drill = !!(el.hasAttribute && el.hasAttribute('data-dv-detail'));
    if (drill && ctl.details && ctl.details.snapshot()){
      /* the viewer opened the detail during the hold: keep it, but it is
         still closed when the step is left */
      clickedTrigger = el;
      settling = false;
      guarded(position);
      showCard();
      watch(queryTarget(step, sec, eff.target) || el);
      return;
    }
    if (el.getAttribute && el.getAttribute('aria-expanded') === 'true'){
      settling = false;
      guarded(position);
      showCard();
      watch(queryTarget(step, sec, eff.target) || el);
      return;
    }
    el.dispatchEvent(new win.MouseEvent('click', {bubbles: true, cancelable: true}));
    clickedTrigger = el;
    if (drill){
      /* a drill replaces the parent section with the detail: bring the new
         flow to the top of the viewport (unlike a menu, which the engine
         dismisses on scroll), let layout settle a frame, then place rings
         and card once */
      settling = true; /* nothing repaints mid-move (scroll events reschedule) */
      render([]);
      var host = doc.querySelector('.doc-sec[data-dv-detail-preview]');
      if (host && host.scrollIntoView){
        try { host.scrollIntoView({block: 'start', behavior: 'instant'}); } catch (ex) { host.scrollIntoView(); }
        win.scrollBy(0, -16);
      }
      win.setTimeout(function(){ guarded(function(){
        if (!active || list[at] !== step) return;
        settling = false;
        position();
        showCard();
        watch(queryTarget(step, sec, eff.target) || el);
      }); }, 120);
      return;
    }
    settling = false;
    guarded(position);
    showCard(); /* first and only appearance: already beside the menu */
    watch(queryTarget(step, sec, eff.target) || el);
  }
  function position(){
    if (!active) return;
    if (settling) return; /* the move happens under the full dim; the new
                             spotlight is revealed once the layout is stable */
    var step = list[at];
    if (!step || (step.kind || 'spot') !== 'spot'){ fullScrim(); return; }
    var sec = sectionFor(step);
    var eff = effectiveTargets(step);
    var target = queryTarget(step, sec, eff.target);
    if ((!target || !isRendered(target)) && step.demo && step.demo.click && pendingClick)
      target = pendingClick.node; /* pre-click: ring the node the click will use */
    if (!target || !isRendered(target)){ fullScrim(); return; }
    var rect = rectOf(target);
    /* the links step spotlights the whole node card, not the tiny trigger;
       the menu itself is the viewer's click — the engine popover paints in
       the browser top layer, above this overlay */
    if (eff.target && eff.target.selector && eff.target.selector.indexOf('nrefs-trigger') >= 0){
      var nodeEl = target.closest ? target.closest('.node[data-dv-node]') : null;
      if (nodeEl && nodeEl.getBoundingClientRect) rect = rectOf(nodeEl);
    }
    var hole = tourCutoutRect(rect, step.offset, 8, viewport());
    hole.r = 12; hole.kind = 'primary';
    var holes = [hole];
    /* every control the copy names is genuinely un-dimmed AND ringed */
    eff.secondaries.forEach(function(item){
      var second = queryTarget(step, sec, item.target);
      if (!second || !isRendered(second)) return;
      /* all or nothing: a secondary whose padded rect is not FULLY inside
         the viewport gets no ring, no hole and no note — a clipped sliver
         with a note floating beside it points at nothing */
      var r2 = tourCutoutRect(rectOf(second), null, 6, null);
      if (r2.x < 0 || r2.y < 0 || r2.x + r2.w > win.innerWidth || r2.y + r2.h > win.innerHeight) return;
      r2.r = r2.h / 2; /* a pill: shapeOf clamps rx to half the height */
      r2.kind = 'secondary'; r2.note = item.note || '';
      holes.push(r2);
    });
    /* reveal-only cutouts: un-dimmed, no ring — a demo step shows the
       diagram reacting, not just the ringed control */
    (Array.isArray(step.reveal) ? step.reveal : []).forEach(function(item){
      if (!item || typeof item !== 'object') return;
      var shown = queryTarget(step, sec, item);
      if (!shown || !isRendered(shown)) return;
      var r3 = tourCutoutRect(rectOf(shown), null, 6, viewport());
      r3.r = 12; r3.kind = 'reveal';
      holes.push(r3);
    });
    render(holes);
    placeUi(hole); /* against every ring and note just drawn */
    yieldCounter();
  }
  /* the step counter never sits on a ring: if it would, it steps aside for
     this step (the card's eyebrow already carries "STEP n OF m") */
  function yieldCounter(){
    parts.timeline.classList.remove('dv-tour-timeline-yield');
    if (parts.timeline.hidden) return;
    var c = parts.timeline.getBoundingClientRect();
    if (!c.width) return;
    var clash = Array.prototype.some.call(parts.rings.querySelectorAll('.dv-tour-ring, .dv-tour-ring2'), function(n){
      var r = n.getBoundingClientRect();
      return c.left < r.right + 4 && r.left - 4 < c.right && c.top < r.bottom + 4 && r.top - 4 < c.bottom;
    });
    if (clash) parts.timeline.classList.add('dv-tour-timeline-yield');
  }
  function schedule(){
    if (raf) return;
    raf = win.requestAnimationFrame ? win.requestAnimationFrame(function(){ raf = 0; guarded(position); }) :
          (guarded(position), 0);
  }
  function watch(target){
    unwatch();
    if (!active) return;
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
    if (!step.demo || step.demo.advance == null || RM || !sec || !sec.stepper) return;
    var advance = Math.max(1, Math.min(30, Number(step.demo.advance) || 3));
    var interval = Math.max(400, Math.min(10000, Number(step.demo.intervalMs) || 1800));
    /* the demo is a little story: play it from the selected path's first
       stop (jump(0) — the current view's own step list) unless the step
       AUTHORED a starting position via diagramState.step */
    var sp = sec.stepper;
    if (sp.mode() !== 'step') sp.enterStep(false);
    if (!(step.diagramState && step.diagramState.step != null)) sp.jump(0);
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
  function renderStep(step, keepFocus){
    parts.chooser.hidden = true;
    parts.ui.hidden = false;
    var copy = (step.copy && typeof step.copy === 'object') ? step.copy : {};
    var tl = tourTimeline(list, at);
    parts.eyebrow.textContent = copy.eyebrow != null ? String(copy.eyebrow) :
      ('TOUR · STEP ' + tl.current + ' OF ' + tl.total);
    parts.heading.textContent = String(copy.heading || '');
    parts.body.textContent = String(copy.body || '') +
      /* under reduced motion the engine disables ▶ too — the arrows remain */
      (step.demo && step.demo.advance != null && RM ?
        ' Auto-play is off — use the ‹ › step arrows to walk the story yourself.' : '');
    parts.back.disabled = at === 0;
    parts.next.textContent = at >= list.length - 1 ? 'Done' : 'Next';
    /* a held card cannot take focus yet (visibility:hidden): focus Next when
       the card is shown instead */
    focusOnShow = !keepFocus;
    if (focusOnShow && !parts.ui.classList.contains('dv-tour-ui-pending')) focusNext();
  }
  function focusNext(){
    focusOnShow = false;
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
    closeDemoClick();
    var myGen = ++gen; /* a newer entry invalidates every pending timer */
    var dir = index >= at ? 1 : -1;
    var from = at;
    var step = null, sec = null, eff = null, target = null;
    /* Entry-time resolution: entering a step applies its authored tab and
       diagram state, which is what reveals its control (an ambient-hidden
       transport, a panel in another tab). A control still missing or
       unrendered then is an authoring bug: warn and pass through in the
       walking direction — the timeline keeps the authored numbering. */
    for (;;){
      if (index >= list.length){ finish(true); return; }
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
      /* an unresolved path/step token is an entry failure exactly like a
         missing target: the step's authored state cannot exist on this
         page, so it must never show over the wrong one (a non-rejoining
         path under rejoin copy) */
      var dsCheck = step.diagramState || {};
      var spCheck = sec && sec.stepper;
      var tokenMiss =
        (dsCheck.path != null && (!spCheck || resolvePathId(spCheck, dsCheck.path) == null)) ||
        (dsCheck.step === '@shared' && (!spCheck || sharedSourceIndex(spCheck) < 0)) ||
        (dsCheck.step === '@rejoin' && (!spCheck || rejoinSourceIndex(spCheck) < 0)) ||
        (dsCheck.step === '@fork' && (!spCheck || forkSourceIndex(spCheck) < 0));
      if (tokenMiss){
        var pathMiss = dsCheck.path != null && (!spCheck || resolvePathId(spCheck, dsCheck.path) == null);
        if (win.console) console.warn('flowspec: tour step "' + step.id + '" diagramState ' +
          (pathMiss ? 'path "' + dsCheck.path + '"' : 'step "' + dsCheck.step + '"') +
          ' did not resolve — check the tour config for this diagram');
        index += dir; continue;
      }
      /* a click step's validity rests on its click control (which must have
         a target to spotlight afterwards): the click is what puts the menu
         on screen, and it fires only after the settle loop steadies layout */
      pendingClick = null;
      if (step.demo && step.demo.click){
        var clickEl = (step.target && typeof step.target.selector === 'string') ?
          queryTarget(step, sec, step.demo.click) : null;
        if (clickEl){
          /* the control may sit inside a collapsed disclosure: open it
             before judging visibility, exactly as the viewer would */
          for (var canc = clickEl; canc && canc !== doc.body; canc = canc.parentElement || (canc.getRootNode && canc.getRootNode().host))
            if (canc.tagName === 'DETAILS' && !canc.open){ canc.open = true; openedDetails.push(canc); }
        }
        if (!clickEl || !isRendered(clickEl)){
          if (win.console) console.warn('flowspec: tour step "' + step.id +
            '" target not found — check the tour config for this diagram');
          index += dir; continue;
        }
        pendingClick = {el: clickEl,
          node: (clickEl.closest && clickEl.closest('.node[data-dv-node]')) || clickEl};
      }
      /* validity is judged on the AUTHORED target — presentation swaps
         (the reduced-motion transport fallback) never rescue a step whose
         subject is missing from this page */
      var authored = pendingClick ? pendingClick.node : queryTarget(step, sec, step.target);
      if (authored){
        /* a collapsed disclosure hides its content until opened — disclose
           before judging visibility, exactly as the viewer would */
        for (var anc = authored; anc && anc !== doc.body; anc = anc.parentElement || (anc.getRootNode && anc.getRootNode().host))
          if (anc.tagName === 'DETAILS' && !anc.open){ anc.open = true; openedDetails.push(anc); }
      }
      if (!authored || !isRendered(authored)){
        closeDemoClick(); /* a click that opened something must not outlive its step */
        if (win.console) console.warn('flowspec: tour step "' + step.id +
          '" target not found — check the tour config for this diagram');
        index += dir; continue;
      }
      lastSection = sec;
      eff = effectiveTargets(step);
      /* a click step's menu does not exist yet — spotlight its node until
         the settled click opens it */
      target = queryTarget(step, sec, eff.target) || authored;
      break;
    }
    at = index;
    unwatch();
    settling = false;
    showCard(); /* chooser/done cards are static; spot steps re-hold below */
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
    var clickStep = !!(step.demo && step.demo.click);
    /* one movement per step change: full dim first, move under it, reveal */
    settling = true;
    holdCard();
    render([]);
    if (target){
      /* scrollIntoView first (it also centers inside the board's own
         horizontal scroller), then correct the window explicitly — on SVG
         children scrollIntoView may move only the inner scroller */
      var spot = clickStep && pendingClick ? pendingClick.node :
        (eff.target && eff.target.selector && eff.target.selector.indexOf('nrefs-trigger') >= 0 && target.closest ?
          (target.closest('.node[data-dv-node]') || target) : target);
      if (spot.scrollIntoView){
        try { spot.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}); }
        catch (ex) { spot.scrollIntoView(); }
      }
      recenter(spot);
      /* engine step-change scrolling and freshly disclosed boards settle
         asynchronously: keep correcting under the full dim until the target
         rect is stable, then reveal the new spotlight in ONE movement */
      var settleTries = 8, lastTop = null;
      (function settle(){
        if (!active || gen !== myGen) return;
        recenter(spot);
        var top = Math.round(spot.getBoundingClientRect().top);
        var inView = top >= 0 && top <= win.innerHeight;
        if ((inView && top === lastTop) || --settleTries <= 0){
          settling = false;
          if (inView && clickStep){
            /* cause before effect: reveal the ringed trigger, hold a beat,
               then let the viewer watch the click land — the card waits and
               appears once, beside the opened menu */
            guarded(position);
            win.setTimeout(function(){ guarded(function(){
              if (gen === myGen) firePendingClick(step, sec, eff);
            }); }, 600);
          }
          else {
            guarded(position);
            showCard();
            watch(target);
            if (inView) startDemo(step, sec);
          }
          return;
        }
        lastTop = top;
        win.setTimeout(function(){ guarded(settle); }, 80);
      })();
    } else { settling = false; showCard(); }
    /* the engine closes its menu when focus leaves it: a click step leaves
       focus where the engine put it (the menu's first link) */
    renderTimeline(); renderStep(step, clickStep);
    /* watch + position happen at reveal (settle completion); resize/scroll
       reschedules stay armed for the revealed state */
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
    if (ev.key === 'Tab'){
      /* keep keyboard focus inside the tour: wrap over the buttons that are
         actually rendered and visible now (the held card and the hidden
         chooser/card don't count; the fixed Skip control does) */
      var focusable = Array.prototype.filter.call(overlay.querySelectorAll('button:not([disabled])'), function(b){
        if (!b.getClientRects().length) return false;
        try { return win.getComputedStyle(b).visibility !== 'hidden'; } catch (ex) { return true; }
      });
      if (focusable.length){
        var first = focusable[0], last = focusable[focusable.length - 1];
        var inside = focusable.indexOf(doc.activeElement) >= 0;
        if (!inside){ (ev.shiftKey ? last : first).focus(); ev.preventDefault(); }
        else if (ev.shiftKey && doc.activeElement === first){ last.focus(); ev.preventDefault(); }
        else if (!ev.shiftKey && doc.activeElement === last){ first.focus(); ev.preventDefault(); }
      }
      return;
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
    }
  }
  /* While the tour's ⋯ menu is open, focus moving onto the tour's own
     controls (Tab, a click on the card) must not close it: the engine
     closes its menu on any focusin outside it. A window-level capture
     listener runs before the engine's document-level one and stops those
     events — only for targets inside the overlay, only while the menu the
     tour opened is still open. */
  function guardFocus(ev){
    if (clickedTrigger && clickedTrigger.getAttribute &&
        clickedTrigger.getAttribute('aria-expanded') === 'true' &&
        overlay && overlay.contains(ev.target)) ev.stopImmediatePropagation();
  }
  function pagePointer(ev){
    /* touching the page through the hole (the spotlit control) takes over
       from a running demo, just like touching the tour's own controls */
    if (demoTimer && overlay && !overlay.contains(ev.target)) stopDemo();
  }
  function attach(){
    doc.addEventListener('keydown', keydown, true);
    doc.addEventListener('pointerdown', pagePointer, true);
    win.addEventListener('focusin', guardFocus, true);
    win.addEventListener('resize', schedule);
    doc.addEventListener('scroll', schedule, true);
    doc.addEventListener('fullscreenchange', schedule);
  }
  function detach(){
    unwatch();
    doc.removeEventListener('keydown', keydown, true);
    doc.removeEventListener('pointerdown', pagePointer, true);
    win.removeEventListener('focusin', guardFocus, true);
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
    fullScrim(); /* the overlay opens on a fully dimmed page */
    takeSnapshot();
    ctl.suppressFragmentWrites = true;
    list = buildList();
    at = 0;
    if (!list.length){ finish(); return; }
    if ((list[0].kind || 'spot') !== 'chooser'){ persona = 'both'; list = buildList(); }
    attach();
    go(0);
  }
  function finish(done){
    if (!active) return;
    active = false;
    settling = false;
    stopDemo();
    closeDemoClick();
    markDone();
    detach();
    try { restoreSnapshot(); }
    catch (ex) { snapshot = null; }
    ctl.suppressFragmentWrites = false;
    if (overlay) overlay.hidden = true;
    /* Done hands over control: the recap invites pressing ▶, so focus the
       transport of the section the tour ran in (a step arrow under reduced
       motion, where the engine disables ▶). Skip/Esc return the reader to
       where they were. */
    var home = done && lastSection && lastSection.sectionEl ? lastSection.sectionEl : null;
    var handoff = home ? (home.querySelector('.playback-button:not([disabled])') ||
      home.querySelector('.step-transport button:not([disabled])')) : null;
    if (handoff && handoff.getClientRects().length){
      try { handoff.focus({preventScroll: true}); } catch (ex) { handoff.focus(); }
    }
    else if (restoreFocus && restoreFocus.isConnected && restoreFocus.focus) restoreFocus.focus();
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
