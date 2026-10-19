/* Shared pure helpers for the mechanism-scene panels (strandscene, cellscene).
   Role palette, SVG shape generators, cluster geometry, the cell outline and
   small validators live here once; each type owns its own state rules,
   rendering and styles (strandscene owns the shared `.mech-*` CSS). Nothing
   here touches the DOM, starts a timer or mutates its input. Scenes are
   cartoons: every position is authored, nothing is simulated, and no role is
   a named real organism, protein or virus. */
var MECH_SCENE = { w: 560, h: 315 };
/* Actor/item palette by role: `fill`, `edge` (outline on the dark skin — the
   light skin darkens it with color-mix in the shared CSS), `ink` (label on the
   fill) and the default `shape`. `membrane` and `nucleus` are compartment
   fills used by cellscene. */
var MECH_ROLES = {
  enzyme: { fill: '#FFB454', edge: '#C9842B', ink: '#1A1206', shape: 'blob' },
  polymerase: { fill: '#B99CFF', edge: '#7B5FCC', ink: '#1B1033', shape: 'clamp' },
  ribosome: { fill: '#7ED9A0', edge: '#3E9C64', ink: '#0B2416', shape: 'lobes' },
  primer: { fill: '#FF8E5A', edge: '#C25A2B', ink: '#2A1005', shape: 'wedge' },
  cap: { fill: '#8AA0C2', edge: '#5A6F8E', ink: '#0E1726', shape: 'cap' },
  protein: { fill: '#6E8FC7', edge: '#415F94', ink: '#0B1220', shape: 'box' },
  particle: { fill: '#38E1FF', edge: '#1C98B0', ink: '#06202A', shape: 'dot' },
  cargo: { fill: '#F08BD0', edge: '#B55A98', ink: '#2A0C22', shape: 'dot' },
  vesicle: { fill: 'rgba(138,160,194,.18)', edge: '#8AA0C2', ink: '#C9D3E2', shape: 'dot', dashed: true },
  virus: { fill: '#B9C46A', edge: '#7E8A3A', ink: '#1C1F0A', shape: 'spiky' },
  ion: { fill: '#FFFFFF', edge: '#8AA0C2', ink: '#0B1220', shape: 'dot' },
  membrane: { fill: '#0E1B2E', edge: '#5E7396', ink: '#C9D3E2', shape: 'dot' },
  nucleus: { fill: '#182A47', edge: '#7F9BD0', ink: '#C9D3E2', shape: 'dot' },
};
var MECH_ROLE_NAMES = ['enzyme', 'polymerase', 'ribosome', 'primer', 'cap', 'protein', 'particle', 'cargo', 'vesicle', 'virus', 'ion'];
var MECH_SHAPE_NAMES = ['blob', 'clamp', 'lobes', 'wedge', 'cap', 'dot', 'pill', 'spiky', 'box'];
var MECH_SIZES = { s: 0.72, m: 1, l: 1.3 };
var MECH_RIPPLE_KINDS = ['bind', 'cross', 'cut', 'signal', 'flash'];
var MECH_CLUSTER_MAX = 50;

function mechRole(value, fallback) {
  return MECH_ROLE_NAMES.indexOf(value) >= 0 ? value : fallback || 'protein';
}
/* The shape drawn for an actor: an explicit valid `shape`, else the role's. */
function mechShape(value, role) {
  return MECH_SHAPE_NAMES.indexOf(value) >= 0 ? value : MECH_ROLES[mechRole(role)].shape;
}
function mechSize(value) {
  return Object.prototype.hasOwnProperty.call(MECH_SIZES, value) ? value : 'm';
}
function mechSizeScale(value) {
  return MECH_SIZES[mechSize(value)];
}
/* Ids are letter-led and safe because actor/item state is keyed by them. */
function mechId(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value) &&
    ['constructor', 'prototype', '__proto__', 'enterOnce'].indexOf(value) < 0;
}
function mechText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function mechNum(value) {
  return Math.round(value * 10) / 10;
}
/* Validated free-space position in scene units (clamped to the 560×315
   scene) or null after one warning at `path`. */
function mechXY(value, path, warnings) {
  if (!panelObject(value) || !isFiniteNum(value.x) || !isFiniteNum(value.y)) {
    if (warnings) warnings.push(path + ': expected {x, y} in scene units (0–' + MECH_SCENE.w + ' × 0–' + MECH_SCENE.h + ') — ignored');
    return null;
  }
  return { x: mechNum(clamp(value.x, 0, MECH_SCENE.w)), y: mechNum(clamp(value.y, 0, MECH_SCENE.h)) };
}

/* Pure SVG path generators, each `(w, h) → d` centred on 0,0. */
var MECH_SHAPES = {
  /* An enzyme: a rounded blob with a slot underneath that grips a strand. */
  blob: function (w, h) {
    var a = w / 2, b = h / 2, s = w / 8, depth = h / 5, f = mechNum;
    return 'M' + f(-a) + ',' + f(-b * 0.2) +
      ' C' + f(-a) + ',' + f(-b) + ' ' + f(-a * 0.45) + ',' + f(-b) + ' 0,' + f(-b) +
      ' C' + f(a * 0.45) + ',' + f(-b) + ' ' + f(a) + ',' + f(-b) + ' ' + f(a) + ',' + f(-b * 0.2) +
      ' C' + f(a) + ',' + f(b * 0.6) + ' ' + f(a * 0.78) + ',' + f(b) + ' ' + f(a / 2) + ',' + f(b) +
      ' L' + f(s) + ',' + f(b) + ' L' + f(s) + ',' + f(b - depth) + ' L' + f(-s) + ',' + f(b - depth) + ' L' + f(-s) + ',' + f(b) +
      ' L' + f(-a / 2) + ',' + f(b) +
      ' C' + f(-a * 0.78) + ',' + f(b) + ' ' + f(-a) + ',' + f(b * 0.6) + ' ' + f(-a) + ',' + f(-b * 0.2) + ' Z';
  },
  /* A polymerase: a ring open at the bottom so it can sit over a strand. */
  clamp: function (w, h) {
    var rx = w / 2, ry = h / 2, t = Math.min(w, h) * 0.3, gap = (35 * Math.PI) / 180, f = mechNum;
    var a1 = Math.PI / 2 + gap, a2 = Math.PI / 2 - gap;
    function pt(rxx, ryy, angle) { return f(rxx * Math.cos(angle)) + ',' + f(ryy * Math.sin(angle)); }
    return 'M' + pt(rx, ry, a1) + ' A' + f(rx) + ',' + f(ry) + ' 0 1,1 ' + pt(rx, ry, a2) +
      ' L' + pt(rx - t, ry - t, a2) + ' A' + f(rx - t) + ',' + f(ry - t) + ' 0 1,0 ' + pt(rx - t, ry - t, a1) + ' Z';
  },
  /* A ribosome: two stacked lobes, the larger one below. */
  lobes: function (w, h) {
    function ellipse(cx, cy, rx, ry) {
      var f = mechNum;
      return 'M' + f(cx - rx) + ',' + f(cy) + ' a' + f(rx) + ',' + f(ry) + ' 0 1,0 ' + f(rx * 2) + ',0 a' + f(rx) + ',' + f(ry) + ' 0 1,0 ' + f(-rx * 2) + ',0 Z';
    }
    return ellipse(0, h * 0.2, w / 2, h * 0.3) + ' ' + ellipse(0, -h * 0.28, w * 0.36, h * 0.24);
  },
  /* A primer: an arrow pointing along the strand. */
  wedge: function (w, h) {
    var a = w / 2, b = h / 2, f = mechNum;
    return 'M' + f(-a) + ',' + f(-b) + ' L' + f(a * 0.5) + ',' + f(-b) + ' L' + f(a) + ',0 L' + f(a * 0.5) + ',' + f(b) + ' L' + f(-a) + ',' + f(b) + ' Z';
  },
  /* A cap: a half-dome with a flat base. */
  cap: function (w, h) {
    var a = w / 2, b = h / 2, f = mechNum;
    return 'M' + f(-a) + ',' + f(b) + ' C' + f(-a) + ',' + f(-b * 1.1) + ' ' + f(a) + ',' + f(-b * 1.1) + ' ' + f(a) + ',' + f(b) + ' Z';
  },
  dot: function (w, h) {
    var rx = w / 2, ry = h / 2, f = mechNum;
    return 'M' + f(-rx) + ',0 a' + f(rx) + ',' + f(ry) + ' 0 1,0 ' + f(rx * 2) + ',0 a' + f(rx) + ',' + f(ry) + ' 0 1,0 ' + f(-rx * 2) + ',0 Z';
  },
  pill: function (w, h) {
    var a = w / 2, b = h / 2, r = Math.min(a, b), f = mechNum;
    return 'M' + f(-a + r) + ',' + f(-b) + ' L' + f(a - r) + ',' + f(-b) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(a - r) + ',' + f(b) +
      ' L' + f(-a + r) + ',' + f(b) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(-a + r) + ',' + f(-b) + ' Z';
  },
  /* A generic spiky particle (virus-like, never a named virus). */
  spiky: function (w, h) {
    var rx = w / 2, ry = h / 2, n = 12, f = mechNum, d = '';
    for (var i = 0; i < n * 2; i++) {
      var angle = (i * Math.PI) / n, k = i % 2 ? 0.72 : 1;
      d += (i ? ' L' : 'M') + f(rx * k * Math.cos(angle)) + ',' + f(ry * k * Math.sin(angle));
    }
    return d + ' Z';
  },
  /* A generic protein: a rounded box. */
  box: function (w, h) {
    var a = w / 2, b = h / 2, r = Math.min(3, a, b), f = mechNum;
    return 'M' + f(-a + r) + ',' + f(-b) + ' H' + f(a - r) + ' Q' + f(a) + ',' + f(-b) + ' ' + f(a) + ',' + f(-b + r) +
      ' V' + f(b - r) + ' Q' + f(a) + ',' + f(b) + ' ' + f(a - r) + ',' + f(b) + ' H' + f(-a + r) + ' Q' + f(-a) + ',' + f(b) + ' ' + f(-a) + ',' + f(b - r) +
      ' V' + f(-b + r) + ' Q' + f(-a) + ',' + f(-b) + ' ' + f(-a + r) + ',' + f(-b) + ' Z';
  },
};
/* Soft-clay shading: every mechanism SVG carries one small `<defs>` with a
   top-lit linear "clay" overlay (white at the top, clear through the middle,
   a faint ink shade at the bottom) and a radial "ball" overlay for round
   shapes. Actors repeat their silhouette with the overlay on top of the role
   fill, so one gradient serves every role and each skin retunes the stops in
   CSS. The ids are derived from the declaration, so markup is deterministic;
   the svg root names them through `--mk-clay` / `--mk-ball` and a missing
   reference simply paints nothing. Pure decoration; it carries no meaning. */
function mechUid(panel) {
  var text = '';
  try { text = JSON.stringify(panel) || ''; } catch (e) { text = ''; }
  var h = 5381;
  for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return 'mk' + (h >>> 0).toString(36);
}
function mechDefsMarkup(uid) {
  return '<defs aria-hidden="true">' +
    '<linearGradient id="' + uid + '-clay" x1="0" y1="0" x2="0" y2="1"><stop class="mech-gs-top" offset="0"/><stop class="mech-gs-mid" offset=".48"/><stop class="mech-gs-low" offset="1"/></linearGradient>' +
    '<radialGradient id="' + uid + '-ball" cx=".38" cy=".32" r=".72" fx=".34" fy=".26"><stop class="mech-gs-spec" offset="0"/><stop class="mech-gs-mid" offset=".5"/><stop class="mech-gs-low" offset="1"/></radialGradient>' +
    '<radialGradient id="' + uid + '-cyto" cx=".5" cy=".42" r=".62"><stop class="cellscene-gs-c" offset="0"/><stop class="cellscene-gs-m" offset=".72"/><stop class="cellscene-gs-e" offset="1"/></radialGradient>' +
    '</defs>';
}
function mechDefsStyle(uid) {
  return '--mk-clay:url(#' + uid + '-clay);--mk-ball:url(#' + uid + '-ball);--mk-cytofill:url(#' + uid + '-cyto)';
}
var MECH_BALL_SHAPES = ['dot', 'spiky'];
function mechClayMarkup(shape, d) {
  return '<path class="mech-clay' + (MECH_BALL_SHAPES.indexOf(shape) >= 0 ? ' mech-ball' : '') + '" d="' + d + '" aria-hidden="true"/>';
}
/* Base width and height of each shape at size m; sizes scale both. */
var MECH_SHAPE_SIZE = {
  blob: [72, 44], clamp: [48, 44], lobes: [40, 40], wedge: [36, 18], cap: [40, 16],
  dot: [18, 18], pill: [34, 16], spiky: [30, 30], box: [34, 22],
};
function mechShapeBox(shape, size) {
  var base = MECH_SHAPE_SIZE[mechShape(shape)] || MECH_SHAPE_SIZE.box, scale = mechSizeScale(size);
  return { w: mechNum(base[0] * scale), h: mechNum(base[1] * scale) };
}

/* Up to 50 deterministic {dx, dy} offsets on a golden-angle spiral so a
   `count` renders as a stable cluster that never jitters between renders.
   `r` is the dot radius; spacing scales with it from the 4.5-unit default. */
function mechCluster(n, r) {
  var count = isFiniteNum(n) ? Math.round(clamp(n, 0, MECH_CLUSTER_MAX)) : 0,
    scale = isFiniteNum(r) && r > 0 ? r / 4.5 : 1, out = [];
  for (var i = 0; i < count; i++) {
    var angle = i * 2.39996, d = i === 0 ? 0 : (4.2 * Math.sqrt(i) + 3) * scale;
    out.push({ dx: mechNum(Math.cos(angle) * d), dy: mechNum(Math.sin(angle) * d * 0.8) });
  }
  return out;
}
/* Closed 96-point outline of a cell; `pinch` 0–1 narrows the waist and
   stretches x. At pinch ≥ 1 callers draw two daughters instead. */
function mechCellOutline(cx, cy, rx, ry, pinch) {
  var k = isFiniteNum(pinch) ? clamp(pinch, 0, 1) : 0, pts = [];
  for (var i = 0; i < 96; i++) {
    var th = (i / 96) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    pts.push(mechNum(cx + rx * (1 + 0.22 * k) * c) + ',' + mechNum(cy + ry * s * (1 - 0.93 * k * Math.exp(-(c * c) / 0.11))));
  }
  return 'M' + pts.join('L') + 'Z';
}
/* Inline style that places a moved element back at its previous position;
   the shared glide lifecycle clears it after two frames and CSS transitions
   it to the new place (the radar/homemap pattern). '' when nothing moved. */
function mechGlideStyle(prev, now) {
  if (!prev || !now || !isFiniteNum(prev.x) || !isFiniteNum(prev.y) || !isFiniteNum(now.x) || !isFiniteNum(now.y)) return '';
  var dx = prev.x - now.x, dy = prev.y - now.y;
  if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) return '';
  return ' style="transform:translate(' + mechNum(dx) + 'px,' + mechNum(dy) + 'px)"';
}
/* Eight short rays around a point: the spark of a cut. */
function mechSparkPath(cx, cy) {
  var d = '';
  for (var i = 0; i < 8; i++) {
    var a = (i * Math.PI) / 4 + Math.PI / 8, r1 = i % 2 ? 8 : 7, r2 = i % 2 ? 13 : 16;
    d += 'M' + mechNum(cx + r1 * Math.cos(a)) + ',' + mechNum(cy + r1 * Math.sin(a)) + 'L' + mechNum(cx + r2 * Math.cos(a)) + ',' + mechNum(cy + r2 * Math.sin(a));
  }
  return d;
}
/* One-shot ripple markup at a scene point. Removed by the shared lifecycle on
   seek or reduced motion; callers emit it only when animating. `delay` is in
   milliseconds (multiples of 250 keep in-step sequencing bounded). */
function mechRipple(x, y, kind, delay) {
  var k = MECH_RIPPLE_KINDS.indexOf(kind) >= 0 ? kind : 'flash', ms = isFiniteNum(delay) ? Math.max(0, Math.round(delay)) : 0;
  var cx = mechNum(x), cy = mechNum(y);
  return '<g class="mech-transient mech-ripple k-' + k + '" style="--mx:' + cx + 'px;--my:' + cy + 'px;animation-delay:' + ms + 'ms" aria-hidden="true">' +
    (k === 'flash' || k === 'cut' ? '<circle class="mech-rip-fill" cx="' + cx + '" cy="' + cy + '" r="14"/>' : '') +
    (k === 'cut' ? '<path class="mech-spark" d="' + mechSparkPath(cx, cy) + '"/>' : '') +
    '<circle class="mech-rip-a" cx="' + cx + '" cy="' + cy + '" r="12"/><circle class="mech-rip-b" cx="' + cx + '" cy="' + cy + '" r="7"/></g>';
}
/* One actor or item shape: a `<g>` with the role fill and edge as custom
   properties, the shape path and the role label inside (aria-hidden; the
   scene's aria-label narrates). `attrs` is extra escaped markup for the group. */
function mechActorMarkup(actor, attrs) {
  var role = MECH_ROLES[mechRole(actor.role)], shape = mechShape(actor.shape, actor.role), box = mechShapeBox(shape, actor.size);
  var label = mechText(actor.label, 16), d = MECH_SHAPES[shape](box.w, box.h);
  /* The ribosome's waist is narrower than its name, so its label sits beside
     the large lobe, clear of the strand above and the site tags below. */
  var side = shape === 'lobes';
  var textY = shape === 'blob' ? -box.h * 0.1 : shape === 'clamp' ? -box.h * 0.62 : shape === 'wedge' || shape === 'cap' ? -box.h * 0.5 - 4 : shape === 'dot' || shape === 'spiky' ? box.h * 0.5 + 11 : side ? box.h * 0.2 + 3.5 : 3.5;
  var inside = shape === 'blob' || shape === 'box' || shape === 'pill';
  return '<g class="mech-actor mech-shape-' + shape + (attrs || '') + '" style="--mf:' + role.fill + ';--me:' + role.edge + ';--mi:' + role.ink + '">' +
    '<path d="' + d + '"' + (role.dashed ? ' stroke-dasharray="3 3"' : '') + '/>' + (role.dashed ? '' : mechClayMarkup(shape, d)) +
    (label ? '<text class="mech-t-actor' + (inside ? ' mech-t-inside' : side ? ' mech-t-side' : '') + '"' + (side ? ' x="' + mechNum(box.w / 2 + 5) + '"' : '') + ' y="' + mechNum(textY) + '" aria-hidden="true">' + esc(label) + '</text>' : '') +
    '</g>';
}
/* A tag: short text on a rounded rect centred at x,y (Plex Sans 10.5 px). */
function mechTagMarkup(x, y, text, cls) {
  var label = mechText(text, 40), w = label.length * 6.4 + 14;
  return '<g class="mech-tag' + (cls ? ' ' + cls : '') + '"><rect x="' + mechNum(x - w / 2) + '" y="' + mechNum(y - 9) + '" width="' + mechNum(w) + '" height="17" rx="8.5"/>' +
    '<text class="mech-t-tag" x="' + mechNum(x) + '" y="' + mechNum(y + 3.5) + '" text-anchor="middle">' + esc(label) + '</text></g>';
}
/* Legend chips under a scene: `{id, role, name, state, hot, dashed?, tone?}`
   → real HTML text. A `tone` swatch borrows the shared `.bio-tone-*` colour
   (for sites); the chip's data-id lets the renderer pulse one changed actor. */
function mechLegendHTML(chips) {
  if (!chips.length) return '';
  return '<ul class="mech-legend" aria-label="Scene legend">' + chips.map(function (chip) {
    var role = MECH_ROLES[mechRole(chip.role)];
    var tone = BIO_TONES.indexOf(chip.tone) >= 0 ? chip.tone : null;
    return '<li class="mech-chip" data-id="' + esc(chip.id) + '"><i class="mech-sw' + (chip.dashed ? ' mech-sw-dashed' : '') + (tone ? ' bio-tone-' + tone : '') +
      '" style="--mf:' + role.fill + ';--me:' + (tone ? 'var(--bio-tone)' : role.edge) + '" aria-hidden="true"></i>' +
      esc(chip.name) + (chip.state ? ' <small class="mech-st' + (chip.hot ? ' hot' : '') + '">' + esc(chip.state) + '</small>' : '') + '</li>';
  }).join('') + '</ul>';
}
