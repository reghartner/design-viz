/* Pure diagram layout, routing and collision geometry. The only shared
   call-time dependency is clamp() from validator.js; no DOM initialization.
   Loaded once by the logical validator bundle before panel definitions. */

var W = 1180, CARD_H = 54, FLOAT_H = 44, ROW_GAP = 140, STACK_GAP = 46;
/* Reserve equal card gutters; a fixed right column left a node-sized blank
   strip when Auto or Fit width scaled the entire canvas. */
var LEFT_X = 110, RIGHT_X = W - LEFT_X;

/* Shared, pure parent-link tolerance for layout, validation and the inspector.
   Inspect all chains before dropping cyclic links so declaration order cannot
   decide which cycle member becomes the outer box. Incoming links survive. */
function sanitizedGroupParents(groups, ignored){
  groups = groups && typeof groups === 'object' ? groups : {};
  var parents = Object.create(null), cyclic = [];
  Object.keys(groups).forEach(function(key){
    var meta = groups[key], reason;
    if (!meta || !Object.prototype.hasOwnProperty.call(meta, 'parent')) return;
    var parent = meta.parent;
    if (typeof parent !== 'string') reason = 'must be a string — parent ignored';
    else if (parent === key) reason = 'a group cannot contain itself — parent ignored';
    else if (!Object.prototype.hasOwnProperty.call(groups, parent))
      reason = 'unknown group "' + parent + '" — parent ignored';
    if (reason){ if (ignored) ignored(key, reason); }
    else parents[key] = parent;
  });
  Object.keys(parents).forEach(function(key){
    var seen = Object.create(null), cursor = key;
    while (cursor !== undefined && !seen[cursor]){
      seen[cursor] = true;
      cursor = parents[cursor];
    }
    if (cursor === key) cyclic.push(key);
  });
  cyclic.forEach(function(key){
    delete parents[key];
    if (ignored) ignored(key, 'parent chain loops — parent ignored');
  });
  return parents;
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
    var xO = (side > 0 ? W - 12 : 12) + avX;
    var s1x = a.cx + side * a.w/2, t1x = b.cx + side * b.w/2;
    /* Full-width columns leave a narrow outside gutter. Bound the curve's
       handles there instead of projecting them 115px beyond the canvas. */
    var sControl = side > 0 ? Math.min(s1x + 115, xO) : Math.max(s1x - 115, xO);
    var tControl = side > 0 ? Math.min(t1x + 115, xO) : Math.max(t1x - 115, xO);
    var mid = (a.cy + b.cy) / 2;
    return 'M ' + s1x + ' ' + a.cy +
           ' C ' + sControl + ' ' + a.cy + ' ' + xO + ' ' + (a.cy + 55) + ' ' + xO + ' ' + mid +
           ' C ' + xO + ' ' + (b.cy - 55) + ' ' + tControl + ' ' + b.cy + ' ' + t1x + ' ' + b.cy;
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
