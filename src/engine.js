/* engine.js — layout, geometry, board/panel renderers, stepper, page renderer.
   Browser-pure fragment concatenated after validator.js by tools/build.py.
   layout/isWrap/edgePath are pure (Node-testable); the render functions need a
   DOM and are only called from the boot files. */

var SVGNS = 'http://www.w3.org/2000/svg';
var RM = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

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

/* A story tween is presentation-only and exists solely between two adjacent
   already-folded step states. Callers can explicitly suppress the narrative
   path for deep links/restores; reduced motion is a hard gate. */
function shouldTweenStep(fromIndex, toIndex, reducedMotion, narrativePath){
  return narrativePath !== false && !reducedMotion &&
    validRevealIndex(fromIndex) && validRevealIndex(toIndex) &&
    Math.abs(toIndex - fromIndex) === 1;
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
   Only explicit step nodes and endpoints of active edges receive `lit`. */
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
  (step.nodes || []).forEach(function(id){ focused[id] = true; });
  Object.keys(focused).forEach(function(id){
    var node = nodeEls[id];
    if (node && node.classList && !node.classList.contains('lit')) node.classList.add('lit');
  });
}

/* ---------------- layout + geometry (per diagram) ---------------- */
function layout(spec){
  var pos = {}, rowsMeta = [];
  var floats = spec.floats || [];
  var hasAbove = floats.some(function(f){ return f && f.side !== 'below'; });
  var hasGroups = false;
  Object.keys(spec.nodes || {}).forEach(function(id){
    if (spec.nodes[id] && spec.nodes[id].group) hasGroups = true;
  });
  var top = hasAbove ? 125 : 42;
  if (hasGroups) top += 26; /* room for a group title above row 0 */

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
    top += rowH + ROW_GAP;
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
  var groupBoxes = {};
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
    var b = groupBoxes[g];
    b.x = b.x1 - GROUP_PAD; b.y = b.y1 - GROUP_PAD - GROUP_TITLE;
    b.w = (b.x2 - b.x1) + 2*GROUP_PAD; b.h = (b.y2 - b.y1) + 2*GROUP_PAD + GROUP_TITLE;
  });

  var H = lastRow.top + lastRow.height + 40;
  floats.forEach(function(f){
    if (f && f.side === 'below' && pos[f.id]) H = Math.max(H, pos[f.id].cy + FLOAT_H/2 + 24);
  });
  return {pos:pos, rows:rowsMeta, groups:groupBoxes, H: H};
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
  var a = L.pos[e.from], b = L.pos[e.to];
  return a && b && !a.float && !b.float && b.row === a.row + 1 &&
         a.flow === L.rows[a.row].k - 1 && b.flow === 0;
}

/* Straight-drop preference: a cross-row edge (wrap included) whose endpoint
   x-centers align within STRAIGHT_TOL renders as a vertical drop; within
   NEAR_TOL it gets a minimal vertical-tangent S instead of the wide route. */
var STRAIGHT_TOL = 40, NEAR_TOL = 96;

function edgePath(e, L, adj){
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
    for (t = 0; t <= 1.0001; t += 0.04){
      pts.push({x: nums[0] + (nums[2] - nums[0]) * t, y: nums[1] + (nums[3] - nums[1]) * t});
    }
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
  return {b: kv.b != null ? kv.b : null,
          t: kv.t != null ? kv.t : null,
          d: kv.d != null ? kv.d : null,
          c: kv.c != null ? kv.c : null,
          r: kv.r != null ? kv.r : null,
          s: kv.s != null ? kv.s : null,
          x: kv.x != null ? kv.x : null,
          e: kv.e != null ? kv.e : null,
          m: (kv.m === 'step' || kv.m === 'ambient') ? kv.m : null};
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
var SCENES = {
  'person-at-door-night':
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#0A0F14"/>' +
    '<rect x="0" y="150" width="320" height="30" fill="#131A21"/>' +
    '<rect x="118" y="28" width="84" height="124" rx="3" fill="#10161D" stroke="#26313C" stroke-width="2"/>' +
    '<circle cx="188" cy="94" r="3" fill="#26313C"/>' +
    '<circle cx="262" cy="30" r="12" fill="#1C2833"/>' +
    '<g class="walker"><circle cx="0" cy="86" r="9" fill="#202B36"/>' +
    '<rect x="-7" y="96" width="14" height="34" rx="6" fill="#202B36"/>' +
    '<rect x="-6" y="128" width="5" height="22" rx="2.5" fill="#202B36"/>' +
    '<rect x="2" y="128" width="5" height="22" rx="2.5" fill="#202B36"/></g>' +
    '<g class="grain" fill="#2A3742"><circle cx="40" cy="40" r="1"/><circle cx="90" cy="120" r="1"/>' +
    '<circle cx="240" cy="70" r="1"/><circle cx="280" cy="140" r="1"/><circle cx="150" cy="15" r="1"/></g></svg>',
  'package-drop':
    /* courier + package positions are the ANIMATION END STATES' anchors: the
       courier group is parked off-canvas by default CSS (reduced motion shows
       only the delivered package), the package is visible by default and the
       running animation hides it until the drop beat */
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#0A0F14"/>' +
    '<rect x="0" y="150" width="320" height="30" fill="#131A21"/>' +
    '<rect x="118" y="28" width="84" height="124" rx="3" fill="#10161D" stroke="#26313C" stroke-width="2"/>' +
    '<g class="courier"><circle cx="0" cy="84" r="9" fill="#202B36"/>' +
    '<rect x="-7" y="94" width="14" height="34" rx="6" fill="#202B36"/>' +
    '<rect x="-6" y="126" width="5" height="24" rx="2.5" fill="#202B36"/>' +
    '<rect x="2" y="126" width="5" height="24" rx="2.5" fill="#202B36"/>' +
    '<rect class="carried" x="9" y="104" width="20" height="15" rx="2" fill="#233040" stroke="#31404F" stroke-width="1.5"/></g>' +
    '<g class="pkg"><rect x="216" y="118" width="46" height="34" rx="3" fill="#233040" stroke="#31404F" stroke-width="2"/>' +
    '<line x1="216" y1="135" x2="262" y2="135" stroke="#31404F" stroke-width="2"/></g></svg>',
  'static-noise':
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#0A0F14"/>' +
    '<g class="flick" fill="#1D2731">' +
    '<rect x="0" y="12" width="320" height="5"/><rect x="0" y="52" width="320" height="3"/>' +
    '<rect x="0" y="90" width="320" height="6"/><rect x="0" y="132" width="320" height="4"/>' +
    '<rect x="0" y="160" width="320" height="3"/></g></svg>'
};

/* ---------------- board renderer ---------------- */
function renderBoard(el, d, prefix, skin, protos, backlinks){
  var SK = SKINS[skinBase(skin)];
  var L = layout(d);
  var ADJ = edgeAutoAdjust(d.edges || [], L);
  resolveEdgeAvoidance(d.edges || [], L, ADJ);   /* offsets first, then avoidance */
  var kindsUsed = {}, anyRet = false;
  (d.edges || []).forEach(function(e){
    kindsUsed[protos[e.kind] ? e.kind : 'int'] = true;
    if (e.ret) anyRet = true;
  });

  var s = '<svg viewBox="0 0 ' + W + ' ' + L.H + '" role="img" aria-label="' + esc(d.title || 'flow diagram') + '" xmlns="' + SVGNS + '">';
  s += '<defs>';
  Object.keys(kindsUsed).forEach(function(k){
    s += '<marker id="' + prefix + '-m-' + k + '" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">' +
         '<path class="dv-protocol-fill" style="' + protocolColorStyle(protos, k) + '" d="M0 0L10 5L0 10z" fill="' + kindColor(protos, k, skinBase(skin)) + '"/></marker>';
  });
  s += '<pattern id="' + prefix + '-g" width="26" height="26" patternUnits="userSpaceOnUse">' +
       '<circle cx="1.3" cy="1.3" r="1.3" fill="#16233C"/></pattern>';
  s += '</defs><rect class="dv-board-ground" width="' + W + '" height="' + L.H + '" fill="' + SK.bg + '"/>' +
       '<rect class="dv-board-grid" width="' + W + '" height="' + L.H + '" fill="url(#' + prefix + '-g)"/>';

  /* containment groups: dashed boundary + title, behind everything */
  var groupDefs = (d.groups && typeof d.groups === 'object') ? d.groups : {};
  Object.keys(L.groups).forEach(function(g){
    var b = L.groups[g];
    var meta = groupDefs[g] || {};
    s += '<g class="grp"><rect class="grpbox" x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="14"/>' +
         '<text class="grptitle" x="' + (b.x + 14) + '" y="' + (b.y + 16) + '">' + esc(meta.title || g) + '</text></g>';
  });

  var edgeIds = {};
  s += '<g>';
  (d.edges || []).forEach(function(e, i){
    var k = protos[e.kind] ? e.kind : 'int';
    s += '<path class="halo dv-protocol-stroke" data-dv-edge="' + i + '"' + fragmentAttrs(e) +
         ' style="' + protocolColorStyle(protos, k) + '" stroke="' +
         kindColor(protos, k, skinBase(skin)) + '" d="' + edgePath(e, L, ADJ[i]) + '"/>';
  });
  (d.edges || []).forEach(function(e, i){
    var id = prefix + '-e' + i;
    var k = protos[e.kind] ? e.kind : 'int';
    edgeIds[e.from + '->' + e.to] = {domId:id, e:e, kind:k, idx:i};
    s += '<path id="' + id + '" class="edge dv-protocol-stroke ' + (e.ret ? 'retm' : 'main') + '"' +
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
    var siblingPages = typeof n.title === 'string' &&
      Object.prototype.hasOwnProperty.call(backlinks || {}, n.title) ? backlinks[n.title] : [];
    var hasNodeLink = n.link && typeof n.link === 'string';
    var backlinkX = p.w - (hasNodeLink ? 38 : 15);
    s += '<g class="node tint-' + tint + '" id="' + prefix + '-n-' + esc(id) + '" data-dv-node="' + esc(id) + '" transform="translate(' + x + ' ' + y + ')">' +
         '<rect class="card" width="' + p.w + '" height="' + p.h + '" rx="12"/>' +
         '<rect class="icbg" x="12" y="' + (small?9:14) + '" width="26" height="26" rx="8"/>' +
         '<use href="#i-' + icon + '" x="17" y="' + (small?14:19) + '" width="16" height="16"/>' +
         '<text class="t1" x="46" y="' + (small?22:25) + '">' + esc(nodeTitle) + '</text>' +
         '<text class="t2" x="46" y="' + (small?36:41) + '">' + esc(n.sub || '') + '</text>' +
         (hasNodeLink ?
           '<a class="nlink" href="' + esc(n.link) + '" target="_blank" rel="noopener" aria-label="Source for ' + esc(nodeTitle) + '">' +
           '<circle cx="' + (p.w - 15) + '" cy="14" r="9" fill="transparent"/>' +
           '<text x="' + (p.w - 15) + '" y="18" text-anchor="middle">&#8599;</text></a>' : '') +
         (siblingPages.length ?
           '<g class="nbackref" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" data-dv-node-id="' + esc(id) + '" aria-label="Other pages containing ' + esc(nodeTitle) + '">' +
           '<circle cx="' + backlinkX + '" cy="14" r="9" fill="transparent"/>' +
           '<text x="' + backlinkX + '" y="18" text-anchor="middle">&#8599;</text></g>' : '') +
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

  /* measured pass: labels, coins, ambient loop dots, manual step dots */
  var stepByEdge = {};
  (d.steps || []).forEach(function(st, i){
    var keys = stepKeys(st);
    if (keys.length && !(keys[0] in stepByEdge) && edgeIds[keys[0]]) stepByEdge[keys[0]] = i + 1;
  });

  var coinRects = [], labelEls = [];
  (d.edges || []).forEach(function(e){
    var info = edgeIds[e.from + '->' + e.to];
    var path = document.getElementById(info.domId);
    var len = path.getTotalLength();
    var mid = path.getPointAtLength(len * 0.5);
    var wrap = isWrap(e, L);
    var stepN = stepByEdge[e.from + '->' + e.to];

    if (stepN){
      var g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'coin');
      g.setAttribute('id', prefix + '-coin-' + stepN);
      g.setAttribute('data-dv-step', String(stepN - 1));
      markFragmentElement(g, e);
      var c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', mid.x); c.setAttribute('cy', mid.y); c.setAttribute('r', 10);
      var t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', mid.x); t.setAttribute('y', mid.y + 3.5); t.setAttribute('text-anchor', 'middle');
      t.textContent = stepN;
      g.appendChild(c); g.appendChild(t); svg.appendChild(g);
      coinRects.push({x: mid.x - 11, y: mid.y - 11, w: 22, h: 22});
    }
    if (e.label){
      var lx = mid.x + (e.labelDx || 0), ly = mid.y - (stepN ? 16 : 9) + (e.labelDy || 0);
      var anchor = 'middle';
      if (wrap){ anchor = 'end'; lx = mid.x - 18 + (e.labelDx || 0); ly = mid.y - 4 + (e.labelDy || 0); }
      var lt = document.createElementNS(SVGNS, 'text');
      lt.setAttribute('class', 'lbl'); lt.setAttribute('x', lx); lt.setAttribute('y', ly);
      lt.setAttribute('text-anchor', anchor);
      lt.setAttribute('data-dv-edge', String(info.idx));
      lt.textContent = e.label;
      markFragmentElement(lt, e);
      svg.appendChild(lt);
      labelEls.push({el: lt, fixed: !!(e.labelDx || e.labelDy)});
      info.labelEl = lt; /* stepper lights the label together with its edge */
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
    });
    coinRects.forEach(function(r){ obstacles.push(r); });
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
      return {x: b.x, y: b.y, w: b.width, h: b.height, fixed: le.fixed};
    });
    var nudges = resolveLabelCollisions(rects, obstacles);
    labelEls.forEach(function(le, i){
      var n = nudges[i];
      if (!n.dx && !n.dy) return;
      le.el.setAttribute('x', parseFloat(le.el.getAttribute('x')) + n.dx);
      le.el.setAttribute('y', parseFloat(le.el.getAttribute('y')) + n.dy);
    });
  })();

  function makeDot(info, cls){
    var col = kindColor(protos, info.kind, skinBase(skin));
    var dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('class', cls + ' dv-protocol-fill');
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
    stepKeys(st).forEach(function(k, j){
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
    stepKeys(st).forEach(function(k){
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
function waterfallModel(spans, state){
  spans = Array.isArray(spans) ? spans : [];
  state = state || {};
  var total = 0;
  spans.forEach(function(s){ total += (s && typeof s.ms === 'number' && s.ms > 0) ? s.ms : 0; });
  var reveal = (typeof state.reveal === 'number') ? clamp(state.reveal, 0, spans.length) : spans.length;
  var off = 0, shown = 0, rows = [];
  spans.forEach(function(s, i){
    var ms = (s && typeof s.ms === 'number' && s.ms > 0) ? s.ms : 0;
    var revealed = i < reveal;
    if (revealed) shown += ms;
    rows.push({id: s && s.id, label: (s && (s.label || s.id)) || '', ms: ms,
               offsetPct: total ? off / total * 100 : 0,
               widthPct: total ? ms / total * 100 : 0,
               revealed: revealed, highlight: !!(s && state.highlight === s.id)});
    off += ms;
  });
  return {rows: rows, totalMs: total, shownMs: shown,
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
var THERMO_ZONE_LABELS = {ok: 'NOMINAL', warn: 'WARNING', crit: 'CRITICAL', na: 'NO DATA'};
function thermoModel(panel, state){
  panel = panel || {}; state = state || {};
  /* finite-only: JSON overflow literals (1e400) parse to Infinity, which is
     typeof 'number' but would poison every percentage into NaN and emit
     invalid SVG/CSS attribute values — treat non-finite as absent */
  function fin(v){ return typeof v === 'number' && isFinite(v) ? v : null; }
  var min = fin(panel.min) != null ? panel.min : 0;
  var max = fin(panel.max) != null && panel.max > min ? panel.max : min + 100;
  var warn = fin(panel.warn) != null ? clamp(panel.warn, min, max) : null;
  var crit = fin(panel.crit) != null ? clamp(panel.crit, min, max) : null;
  if (warn != null && crit != null && warn > crit){ var sw = warn; warn = crit; crit = sw; }
  var value = fin(state.value);
  var zone = 'na';
  if (value != null){
    zone = 'ok';
    if (warn != null && value >= warn) zone = 'warn';
    if (crit != null && value >= crit) zone = 'crit';
  }
  function pct(v){ return clamp((v - min) / (max - min) * 100, 0, 100); }
  return {value: value, min: min, max: max, warn: warn, crit: crit, zone: zone,
          unit: panel.unit != null ? String(panel.unit) : '°C',
          pct: value != null ? pct(value) : 0,
          warnPct: warn != null ? pct(warn) : null,
          critPct: crit != null ? pct(crit) : null,
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
  var label = m.count ? 'Phone with ' + m.count + ' unread notification' + (m.count === 1 ? '' : 's') :
    'Phone with no notifications';
  var h = '<div class="phoneframe" role="img" aria-label="' + esc(label) + '">' +
    '<span class="phonespeaker" aria-hidden="true"></span>' +
    '<div class="phonestatus"><span class="phoneclock">' + esc(m.clock) + '</span>' +
    '<span class="phoneglyphs" aria-hidden="true"><span class="phonesignal"><i></i><i></i><i></i></span>' +
    '<span class="phonebattery"><i></i></span></span></div>';
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
  if (type === 'state'){
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
    h += '</div>';
    h += '<div class="thscale"><span class="lo">' + esc(String(tm.min)) + '</span>';
    if (tm.warn != null) h += '<span class="warn" style="left:' + tm.warnPct.toFixed(1) + '%">' + esc(String(tm.warn)) + '</span>';
    if (tm.crit != null) h += '<span class="crit" style="left:' + tm.critPct.toFixed(1) + '%">' + esc(String(tm.crit)) + '</span>';
    h += '<span class="hi">' + esc(String(tm.max)) + '</span></div>';
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
    if (['off','boot','live','rec','save'].indexOf(mode) < 0) mode = 'off';
    var sceneName = SCENE_NAMES.indexOf(panel.scene) >= 0 ? panel.scene : 'static-noise';
    /* overlays are built separately from the scene so a mode change between
       two scene-showing modes can swap ONLY the overlays (surgical path
       below) and keep the scene subtree's animation state (the walker) */
    var scrOvl = '';
    if (mode === 'live') scrOvl += '<span class="ovl livechip">LIVE</span>';
    if (mode === 'rec') scrOvl += '<span class="ovl recchip"><span class="recdot"></span>REC</span>';
    if (mode === 'save') scrOvl += '<span class="ovl banner">' + esc(state.banner || 'SAVING CLIP') + '</span>';
    if (mode === 'off') scrOvl += '<span class="ovl offlabel">STANDBY</span>';
    h += '<div class="screenbox m-' + mode + '">';
    if (mode === 'boot') h += SCENES['static-noise'];
    else if (mode === 'live' || mode === 'rec' || mode === 'save') h += SCENES[sceneName];
    h += scrOvl + '</div>';
  } else if (type === 'waterfall'){
    var wm = waterfallModel(panel.spans, state);
    var wfPrev = host._wfRevealed || null;
    var wfNow = wm.rows.map(function(r){ return r.revealed; });
    waterfallEntrants = wfPrev ? wfNow.map(function(on, i){ return on && !wfPrev[i]; }) : null;
    host._wfRevealed = wfNow;
    h += '<div class="wfall">';
    wm.rows.forEach(function(r){
      h += '<div class="wfrow' + (r.revealed ? ' on' : '') + (r.highlight ? ' hl' : '') + '">' +
           '<span class="wflabel">' + esc(r.label) + '</span>' +
           '<span class="wftrack"><span class="wfbar" style="margin-left:' + r.offsetPct.toFixed(2) +
           '%;width:' + Math.max(r.widthPct, 1.2).toFixed(2) + '%"></span></span>' +
           '<span class="wfms">' + (r.revealed ? esc(String(r.ms)) + ' ms' : '&#8212;') + '</span></div>';
    });
    h += '<div class="wftotal">total <b>' + esc(wm.totalLabel) + '</b></div></div>';
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
      var transientEls = host.querySelectorAll('.dv-chip-pulse,.dv-bar-enter,.pirghost,.pirtrail,.pirripple,.rdripple');
      for (var te = transientEls.length - 1; te >= 0; te--){
        var transientEl = transientEls[te];
        if (transientEl.classList){
          transientEl.classList.remove('dv-chip-pulse');
          transientEl.classList.remove('dv-bar-enter');
        }
        if (/^(pirghost|pirtrail|pirripple|rdripple)$/.test(transientEl.getAttribute('class') || '') &&
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
     (live / rec / save) swap only the mode class and the overlay chips,
     keeping the scene subtree — the walker's animation state survives.
     Any other transition (off/boot involved, or a first render) rebuilds. */
  var surgical = false;
  var SCENE_SHOWING = {live: true, rec: true, save: true};
  if (type === 'screen' && host._lastHTML != null &&
      SCENE_SHOWING[mode] && SCENE_SHOWING[host._scrMode]){
    var scrBox = host.querySelector('.screenbox');
    if (scrBox){
      surgical = true;
      scrBox.className = 'screenbox m-' + mode;
      var oldOvls = scrBox.querySelectorAll('.ovl');
      for (var ov = oldOvls.length - 1; ov >= 0; ov--)
        oldOvls[ov].parentNode.removeChild(oldOvls[ov]);
      if (scrOvl) scrBox.insertAdjacentHTML('beforeend', scrOvl);
    }
  }
  host._scrMode = (type === 'screen') ? mode : undefined;
  host._lastHTML = (hBaseline != null) ? hBaseline : h;
  if (!surgical) host.innerHTML = h;

  /* pir + radar: release the subject's offset transform on the next frame so
     it glides (CSS transition) from the previous step's position to the new */
  if ((type === 'pir' || type === 'radar') && animate){
    var glideEl = host.querySelector(type === 'pir' ? '.pirsubject[style]' : '.rdsubject[style]');
    if (glideEl){
      /* force the offset position into a painted frame first, or the release
         coalesces into the insertion paint and the transition never runs */
      void glideEl.getBoundingClientRect();
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        glideEl.style.transform = 'translate(0,0)';
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

function buildPanels(asideEl, d, skin){
  var folded = foldPanelStates(d);
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
    asideEl.appendChild(card);
    hosts[p.id] = {panel: p, body: body};
    renderPanelBody(body, p, (folded[p.id] || [])[0], skin, folded[p.id] || [], 0, false);
  });
  return {
    setStep: function(i, animate){
      Object.keys(hosts).forEach(function(pid){
        var states = folded[pid] || [];
        var si = Math.min(i, states.length - 1);
        renderPanelBody(hosts[pid].body, hosts[pid].panel, states[si], skin, states, si, animate);
      });
    }
  };
}

/* ---------------- stepper (click-through) ---------------- */
function attachStepper(secBox, boardDiv, termbar, d, prefix, board, lanes, panelCtl, onChange){
  var toneStates = foldNodeTones(d);
  var steps = (d.steps || []).map(function(st){
    return {keys: stepKeys(st).filter(function(k){ return board.edgeIds[k]; }),
            nodes: stepNodes(st),
            id: (st && typeof st.id === 'string') ? st.id : null,
            lane: (st && typeof st.lane === 'string') ? st.lane : null,
            packets: (st && Array.isArray(st.packets)) ? st.packets : null,
            text: (st && st.text) || '',
            link: (st && typeof st.link === 'string') ? st.link : null};
  });
  var N = steps.length;
  var cur = 0, paintedStep = null, timer = null, mode = 'ambient';
  var pending = [];
  var svg = board.svg;

  var btnAmb = termbar.btnAmb, btnStep = termbar.btnStep;
  var bar = termbar.bar, chipsBox = termbar.chips, stepN = termbar.stepN,
      stepText = termbar.stepText, btnPlay = termbar.btnPlay;
  var captionLine = stepN.parentNode, captionGhost = null, captionTimer = null;

  for (var k = 0; k < N; k++){
    (function(idx){
      var b = document.createElement('button');
      b.className = 'schip';
      b.textContent = idx + 1;
      b.setAttribute('aria-label', 'Go to step ' + (idx + 1));
      b.addEventListener('click', function(){ stopAuto(); setStep(idx); });
      chipsBox.appendChild(b);
    })(k);
  }

  function clearLit(){
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
    stepN.textContent = 'STEP ' + (cur + 1) + '/' + N;
    termbar.lanePill.hidden = !s.lane;
    if (s.lane){
      var lm = lanes[s.lane] || {label: s.lane, color: LANE_FALLBACK};
      termbar.lanePill.textContent = lm.label;
      termbar.lanePill.style.color = lm.color;
      termbar.lanePill.style.borderColor = lm.color;
    }
    stepText.textContent = s.text;
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
    var target = ((i % N) + N) % N;
    var tween = shouldTweenStep(paintedStep, target, RM, narrativePath);
    var tonePulses = tonePulseNodes(toneStates, paintedStep, target, RM, narrativePath);
    if (tween) boardDiv.classList.add('dv-step-tween');
    else boardDiv.classList.remove('dv-step-tween');
    cur = target;
    clearLit();
    applyNodeTones(board.nodeEls, nodeTonesAt(toneStates, cur, true), tonePulses);
    setFragmentStep(secBox, cur, true);
    var s = steps[cur];
    s.keys.forEach(function(key){
      var info = board.edgeIds[key];
      var pe = document.getElementById(info.domId);
      if (pe) pe.classList.add('lit');
      if (info.labelEl) info.labelEl.classList.add('lit');
    });
    applyStepNodeFocus(board.nodeEls, s, board.edgeIds);
    /* ordered packet chain: explicit packets list, else edges in step order */
    if (s.packets){
      s.packets.forEach(function(pk){
        fireDot(pk.edge, Math.max(0, (pk.delay || 0) * 1000));
      });
    } else {
      s.keys.forEach(function(key, j){ fireDot(key, j * 450); });
    }
    var coin = document.getElementById(prefix + '-coin-' + (cur + 1));
    if (coin) coin.classList.add('lit');
    var chips = chipsBox.children;
    for (var j = 0; j < chips.length; j++) chips[j].setAttribute('aria-current', j === cur ? 'true' : 'false');
    updateCaption(s, tween);
    if (panelCtl) panelCtl.setStep(cur, tween);
    paintedStep = cur;
    if (onChange) onChange(claimAddressBar !== false);
  }
  function startAuto(){
    if (timer || RM) return;
    timer = window.setInterval(function(){ setStep(cur + 1, false); }, 3000);
    btnPlay.innerHTML = '&#10074;&#10074;';
    btnPlay.setAttribute('aria-label', 'Pause');
  }
  function stopAuto(){
    if (timer){ window.clearInterval(timer); timer = null; }
    btnPlay.innerHTML = '&#9654;';
    btnPlay.setAttribute('aria-label', 'Play');
  }
  function settleCurrentStep(){
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
    mode = 'step';
    boardDiv.classList.add('stepmode');
    bar.hidden = false;
    paintedStep = null;
    setStep(0, undefined, false);
    if (auto) startAuto();
    syncToggle();
  }
  function enterAmbient(){
    mode = 'ambient';
    stopAuto();
    clearLit();
    clearCaptionTween();
    paintedStep = null;
    boardDiv.classList.remove('dv-step-tween');
    boardDiv.classList.remove('stepmode');
    applyNodeTones(board.nodeEls, nodeTonesAt(toneStates, 0, false), []);
    bar.hidden = true;
    setFragmentStep(secBox, 0, false);
    syncToggle();
    if (panelCtl) panelCtl.setStep(0, false);
    if (onChange) onChange();
  }

  btnAmb.addEventListener('click', enterAmbient);
  btnStep.addEventListener('click', function(){ enterStep(true); });
  btnPlay.addEventListener('click', function(){
    if (timer) stopAuto(); else startAuto();
    if (onChange) onChange(true);
  });
  termbar.btnPrev.addEventListener('click', function(){ stopAuto(); setStep(cur - 1); });
  termbar.btnNext.addEventListener('click', function(){ stopAuto(); setStep(cur + 1); });

  syncToggle();
  return {
    sectionEl: secBox,
    scrollTargetEl: boardDiv,
    enterStep: enterStep,
    enterAmbient: enterAmbient,
    mode: function(){ return mode; },
    current: function(){ return {n: cur, id: steps[cur] ? steps[cur].id : null}; },
    ids: function(){ return steps.map(function(s){ return s.id; }); },
    stepIndexOf: function(sref){ return stepIndexOf(steps.map(function(s){ return s.id; }), sref); },
    jump: function(n){ stopAuto(); setStep(n, undefined, false); },
    advance: function(n){ stopAuto(); setStep(n); },
    toggleAuto: function(){ if (timer) stopAuto(); else startAuto(); },
    onHide: function(){ stopAuto(); settleCurrentStep(); },
    onShow: function(){ settleCurrentStep(); if (mode === 'step') startAuto(); }
  };
}

/* ---------------- section + page renderers ---------------- */
function createBoardGrid(sectionEl, hasPanels){
  var grid = document.createElement('div');
  grid.className = 'boardgrid' + (hasPanels ? ' haspanels' : '');
  sectionEl.appendChild(grid);
  if (!hasPanels) return {grid:grid, diagramHost:grid, controlsHost:sectionEl, diagramCol:null};

  var diagramCol = document.createElement('div');
  diagramCol.className = 'diagramcol';
  grid.appendChild(diagramCol);
  return {grid:grid, diagramHost:diagramCol, controlsHost:diagramCol, diagramCol:diagramCol};
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
    return changed;
  }

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
    if (control.proseEl.style) control.proseEl.style.overflow = '';
    control.animation = null;
  };
  return changed;
}
function createProseController(proseEl, toggleButton, defaultCollapsed, onChange, win, sectionLabel){
  if (!proseEl || !toggleButton) return null;
  var control = {proseEl:proseEl, toggleButton:toggleButton,
                 defaultCollapsed:!!defaultCollapsed, collapsed:!defaultCollapsed,
                 sectionLabel:sectionLabel || 'this section', animation:null};
  setProseCollapsed(control, control.defaultCollapsed, false, win);
  toggleButton.addEventListener('click', function(){
    if (setProseCollapsed(control, !control.collapsed, true, win) && onChange) onChange();
  });
  return control;
}

function buildSection(container, sec, gi, sectionReference, protos, skin, lanes, backlinks, onChange, onProseChange){
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
    typeof window !== 'undefined' ? window : null, intro.sectionLabel) : null;
  var result = {sectionEl:box, stepper:null,
                prose:prose,
                contractCard:box.querySelector('.ctcard'),
                contractRows:Array.prototype.slice.call(box.querySelectorAll('.ctrow'))};
  if (!sec.diagram) return result;

  var d = sec.diagram;
  var prefix = 'fs' + gi;
  var hasPanels = Array.isArray(d.panels) && d.panels.length > 0;

  var boardLayout = createBoardGrid(box, hasPanels);
  var grid = boardLayout.grid;

  var boardDiv = document.createElement('div');
  boardDiv.className = 'board';
  var lg = document.createElement('div'); lg.className = 'lg';
  var bwrap = document.createElement('div');
  bwrap.className = 'boardcanvas';
  boardDiv.appendChild(lg); boardDiv.appendChild(bwrap);
  boardLayout.diagramHost.appendChild(boardDiv);

  var panelCtl = null;
  if (hasPanels){
    var aside = document.createElement('div');
    aside.className = 'panelcol';
    grid.appendChild(aside);
    panelCtl = buildPanels(aside, d, skin);
  }

  var board = renderBoard(bwrap, d, prefix, skin, protos, backlinks);
  lg.innerHTML = legendHTML(board.kindsUsed, board.anyRet, skin, protos);

  var view = VIEW_SET.indexOf(d.view) >= 0 ? d.view : 'ambient';
  var hasSteps = (d.steps || []).length > 0;
  if (!hasSteps || view === 'ambient-only') return result;

  /* mode toggle in the legend bar */
  var tog = document.createElement('span'); tog.className = 'mtoggle';
  var btnAmb = document.createElement('button'); btnAmb.className = 'mbtn'; btnAmb.textContent = 'AMBIENT';
  var btnStep = document.createElement('button'); btnStep.className = 'mbtn'; btnStep.textContent = 'STEP';
  btnAmb.setAttribute('aria-pressed', 'true'); btnStep.setAttribute('aria-pressed', 'false');
  tog.appendChild(btnAmb); tog.appendChild(btnStep); lg.appendChild(tog);

  /* termbar */
  var bar = document.createElement('div');
  bar.className = 'termbar'; bar.hidden = true;
  var btnPrev = document.createElement('button'); btnPrev.className = 'tbtn'; btnPrev.innerHTML = '&#8249;'; btnPrev.setAttribute('aria-label', 'Previous step');
  var btnPlay = document.createElement('button'); btnPlay.className = 'tbtn'; btnPlay.innerHTML = '&#9654;'; btnPlay.setAttribute('aria-label', 'Play');
  var btnNext = document.createElement('button'); btnNext.className = 'tbtn'; btnNext.innerHTML = '&#8250;'; btnNext.setAttribute('aria-label', 'Next step');
  var chips = document.createElement('div'); chips.className = 'schips';
  var line = document.createElement('div'); line.className = 'stepline';
  var stepN = document.createElement('b'); var stepText = document.createElement('span');
  var lanePill = document.createElement('span');
  lanePill.className = 'lanepill'; lanePill.hidden = true;
  var stepIdEl = document.createElement('span');
  stepIdEl.className = 'stepid'; stepIdEl.hidden = true;
  var srcA = document.createElement('a');
  srcA.className = 'steplink'; srcA.target = '_blank'; srcA.rel = 'noopener';
  srcA.textContent = 'source ↗'; srcA.hidden = true;
  var copyStep = document.createElement('button');
  copyStep.type = 'button'; copyStep.className = 'copychip stepcopy';
  copyStep.innerHTML = COPY_ICON; copyStep.title = 'Copy link';
  copyStep.setAttribute('aria-label', 'Copy link to this diagram step');
  line.appendChild(stepN); line.appendChild(lanePill); line.appendChild(stepText);
  line.appendChild(stepIdEl); line.appendChild(srcA); line.appendChild(copyStep);
  bar.appendChild(btnPrev); bar.appendChild(btnPlay); bar.appendChild(btnNext);
  bar.appendChild(chips); bar.appendChild(line);
  boardLayout.controlsHost.appendChild(bar);

  /* print-only numbered caption list (C4) */
  var ol = document.createElement('ol');
  ol.className = 'printsteps';
  (d.steps || []).forEach(function(st){
    var li = document.createElement('li');
    li.textContent = (st && st.lane ? '[' + st.lane + '] ' : '') + ((st && st.text) || '');
    ol.appendChild(li);
  });
  box.appendChild(ol);

  var stepper = attachStepper(box, boardDiv, {
    bar:bar, chips:chips, stepN:stepN, stepText:stepText, srcA:srcA, lanePill:lanePill, stepIdEl:stepIdEl,
    btnPrev:btnPrev, btnPlay:btnPlay, btnNext:btnNext, btnAmb:btnAmb, btnStep:btnStep
  }, d, prefix, board, lanes, panelCtl, onChange);
  stepper.copyButton = copyStep;

  if (view === 'step') stepper.enterStep(true); /* autoplay; paused immediately if its tab starts hidden */
  result.stepper = stepper;
  return result;
}

function renderPage(view, page, skin, backlinks){
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
  function changed(target){
    if (ctl.rendering) return;
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
      }, function(){ if (ctl.onChange) ctl.onChange(); });
    var rec = {number:number, reference:reference, tabBlock:tabBlockIndex, tab:tabIndex,
               sectionEl:built.sectionEl, stepper:built.stepper, prose:built.prose,
               contractCard:built.contractCard, contractRows:built.contractRows};
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

function wireDeepLinks(ctl, win){
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
  function write(){
    if (suppress) return;
    syncChangedTarget();
    if (fragmentState.row == null) clearRowTarget();
    var h = currentHash();
    try {
      win.history.replaceState(null, '',
        h || win.location.pathname + win.location.search);
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
      if (sp && diagramTarget.mode === 'step'){
        sp.enterStep(false);
        if (diagramTarget.step >= 0) sp.jump(diagramTarget.step);
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
    return base + hash;
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
      if (sp.mode() !== 'step') sp.enterStep(true); else sp.toggleAuto();
      ev.preventDefault();
    } else if (/^[1-9]$/.test(ev.key) && ctl.tabBlock){
      var ti = parseInt(ev.key, 10) - 1;
      if (ti < ctl.tabBlock.count){ ctl.tabBlock.select(ti, false); ev.preventDefault(); }
    } else if (ev.key === 'Escape'){
      exit();
    }
  });
}
