/* radar panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function radarModel(panel, state) {
  panel = panel || {};
  state = state || {};
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  var sensor =
    panel.sensor && fin(panel.sensor.x) != null && fin(panel.sensor.y) != null
      ? { x: panel.sensor.x, y: panel.sensor.y }
      : { x: 160, y: 168 };
  var facing = fin(panel.facing) != null ? panel.facing : 270;
  var spread = fin(panel.spread) != null ? clamp(panel.spread, 10, 360) : 120;
  /* POLAR AUTHORING LAYER: with `scale: {pxPerUnit, unit}` declared, authors
     write real units everywhere — `range`, `threshold`, and a `rings` ARRAY
     are unit distances; a zone may be an annular sector {r:[r0,r1],
     deg:[d0,d1]}; a subject may be {r, deg} (degrees in the same clockwise-
     from-+x convention). Everything converts to frame pixels HERE; the rest
     of the model and the renderer stay Cartesian. Without `scale`, all
     numbers are frame pixels and subjects/zones are Cartesian, as before. */
  var ppu =
    panel.scale &&
    fin(panel.scale.pxPerUnit) != null &&
    panel.scale.pxPerUnit > 0
      ? panel.scale.pxPerUnit
      : null;
  var toPx = function (v) {
    return ppu != null ? v * ppu : v;
  };
  var fromPolar = function (r, deg) {
    var a = (deg * Math.PI) / 180;
    return {
      x: sensor.x + toPx(r) * Math.cos(a),
      y: sensor.y + toPx(r) * Math.sin(a),
    };
  };
  var range =
    fin(panel.range) != null && panel.range > 0 ? toPx(panel.range) : 150;
  var ringRadii = null,
    rings = 3;
  if (Array.isArray(panel.rings)) {
    ringRadii = panel.rings
      .map(fin)
      .filter(function (v) {
        return v != null && v > 0;
      })
      .map(toPx)
      .filter(function (v) {
        return v <= range + 0.5;
      })
      .map(function (v) {
        return Math.round(v * 10) / 10;
      });
    rings = ringRadii.length || 3;
    if (!ringRadii.length) ringRadii = null;
  } else if (fin(panel.rings) != null) {
    rings = Math.round(clamp(panel.rings, 1, 6));
  }
  var threshold =
    fin(panel.threshold) != null && panel.threshold > 0
      ? Math.min(toPx(panel.threshold), range)
      : null;
  /* a step may re-tune the alert line: state.threshold (same units as the
     declaration) overrides it for that step onward via normal folding */
  if (fin(state.threshold) != null && state.threshold > 0)
    threshold = Math.min(toPx(state.threshold), range);
  var zones = (Array.isArray(panel.zones) ? panel.zones : [])
    .map(function (z) {
      z = z || {};
      var pts = Array.isArray(z.points) ? z.points : [];
      /* annular sector → sampled polygon (inner arc out, outer arc back) */
      if (
        !pts.length &&
        Array.isArray(z.r) &&
        z.r.length === 2 &&
        Array.isArray(z.deg) &&
        z.deg.length === 2 &&
        fin(z.r[0]) != null &&
        fin(z.r[1]) != null &&
        z.r[0] >= 0 &&
        z.r[1] > z.r[0] &&
        fin(z.deg[0]) != null &&
        fin(z.deg[1]) != null
      ) {
        /* wrapped sectors take the natural short way round ([350,10] spans 20°,
         not 340°); sampling adapts to the span (≈15° chords) so wide sectors
         keep the arc tight enough for correct point-in-polygon occupancy */
        /* span is the clockwise travel from d0 to d1, normalized into (0,360]:
         [350,10] → 20°, and a full-turn writing ([0,360], [360,0], [10,-350])
         → 360°. Only literally equal endpoints are degenerate (skipped; the
         validator warns). */
        var d0 = z.deg[0],
          d1 = z.deg[1];
        var span = (((d1 - d0) % 360) + 360) % 360;
        if (span === 0) {
          if (d0 === d1)
            return { id: z.id, label: z.label || z.id || '', points: [] };
          span = 360;
        }
        var N = Math.max(6, Math.ceil(span / 15));
        pts = [];
        for (var zi = 0; zi <= N; zi++) {
          var p1 = fromPolar(z.r[0], d0 + (span * zi) / N);
          pts.push([p1.x, p1.y]);
        }
        for (var zj = N; zj >= 0; zj--) {
          var p2 = fromPolar(z.r[1], d0 + (span * zj) / N);
          pts.push([p2.x, p2.y]);
        }
        pts = pts.map(function (p) {
          return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
        });
      }
      /* numeric-only points: author data goes straight into SVG attributes, so
       anything non-finite is dropped here (attribute injection impossible) */
      pts = pts
        .filter(function (p) {
          return Array.isArray(p) && fin(p[0]) != null && fin(p[1]) != null;
        })
        .map(function (p) {
          return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
        });
      return { id: z.id, label: z.label || z.id || '', points: pts };
    })
    .filter(function (z) {
      return z.id && z.points.length >= 3;
    });
  var subj = null;
  if (
    state.subject &&
    fin(state.subject.x) != null &&
    fin(state.subject.y) != null
  )
    subj = { x: state.subject.x, y: state.subject.y };
  else if (
    state.subject &&
    fin(state.subject.r) != null &&
    fin(state.subject.deg) != null
  ) {
    var sp = fromPolar(state.subject.r, state.subject.deg);
    subj = { x: Math.round(sp.x * 10) / 10, y: Math.round(sp.y * 10) / 10 };
  }
  var dist = null,
    alert = false,
    occupied = [];
  if (subj) {
    var dx = subj.x - sensor.x,
      dy = subj.y - sensor.y;
    dist = Math.sqrt(dx * dx + dy * dy);
    if (threshold != null && dist <= threshold) alert = true;
    zones.forEach(function (z) {
      if (pointInPoly(subj.x, subj.y, z.points)) occupied.push(z.id);
    });
  }
  if (state.alert === true) alert = true;
  if (state.alert === false) alert = false;
  return {
    sensor: sensor,
    facing: facing,
    spread: spread,
    range: range,
    rings: rings,
    ringRadii: ringRadii,
    threshold: threshold,
    zones: zones,
    subject: subj,
    dist: dist,
    alert: alert,
    occupied: occupied,
    banner: state.banner != null ? String(state.banner) : '',
    status: state.status != null ? String(state.status) : null,
  };
}

/* buffer widget: a segmented buffer strip — pre-roll rings, store-and-forward
   queues, storage rotation. Pure model (node-testable). The author declares
   the segment count once and patches a `cells` array of state tokens per step
   (REPLACES wholesale, like zones); missing tail cells are `empty`, unknown
   tokens fall back to `empty` (validator warns). `head` marks the write
   position. The footer summary (counts per state) is COMPUTED. */

PanelViews.register(
  'radar',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var hBaseline = null;
    var rm2 = radarModel(panel, state);
    var ridx = typeof stepIdx === 'number' ? stepIdx : 0;
    /* one-shot ripple + glide fire on the clear→alert transition / a move,
       with a steady baseline stored so the following unchanged step skips
       (same discipline as pir) */
    var rdFresh = animate && rm2.alert && host._rdAlert === false;
    var rdPrev = host._rdPrev || null;
    var rdMoved =
      animate &&
      rdPrev &&
      rm2.subject &&
      (rdPrev.x !== rm2.subject.x || rdPrev.y !== rm2.subject.y);
    host._rdAlert = rm2.alert;
    host._rdPrev = rm2.subject ? { x: rm2.subject.x, y: rm2.subject.y } : null;
    var rdA1 = ((rm2.facing - rm2.spread / 2) * Math.PI) / 180;
    var rdA2 = ((rm2.facing + rm2.spread / 2) * Math.PI) / 180;
    var rdFull = rm2.spread >= 359.9;
    var rdArc = function (r) {
      if (rdFull) return null;
      var x1 = rm2.sensor.x + r * Math.cos(rdA1),
        y1 = rm2.sensor.y + r * Math.sin(rdA1);
      var x2 = rm2.sensor.x + r * Math.cos(rdA2),
        y2 = rm2.sensor.y + r * Math.sin(rdA2);
      return (
        'M' +
        x1.toFixed(1) +
        ' ' +
        y1.toFixed(1) +
        ' A' +
        r.toFixed(1) +
        ' ' +
        r.toFixed(1) +
        ' 0 ' +
        (rdA2 - rdA1 > Math.PI ? 1 : 0) +
        ' 1 ' +
        x2.toFixed(1) +
        ' ' +
        y2.toFixed(1)
      );
    };
    /* track: the subject positions of every folded step up to the current
       one — engine-derived, so any step jump redraws it consistently */
    var rdTrack = [];
    if (Array.isArray(states)) {
      for (var rti = 0; rti <= Math.min(ridx, states.length - 1); rti++) {
        /* run each folded step through the model so POLAR subjects convert
           exactly like the live one; dedupe parked positions so unchanged
           steps keep identical markup (rebuild skip) */
        var rsub = radarModel(panel, states[rti]).subject;
        var last = rdTrack.length ? rdTrack[rdTrack.length - 1] : undefined;
        if (rsub) {
          if (!(last && last[0] === rsub.x && last[1] === rsub.y))
            rdTrack.push([rsub.x, rsub.y]);
        } else if (last !== null && rdTrack.length) {
          rdTrack.push(null);
        }
      }
    }
    var buildRadar = function (transient) {
      var s =
        '<div class="rdbox"><svg class="rdframe" viewBox="0 0 320 180" role="img" aria-label="' +
        esc(panel.title || 'radar range view') +
        '">';
      s += '<rect width="320" height="180" class="rdbg"/>';
      rm2.zones.forEach(function (z) {
        var zpts = z.points
          .map(function (p) {
            return p[0] + ',' + p[1];
          })
          .join(' ');
        var occ = rm2.occupied.indexOf(z.id) >= 0;
        s +=
          '<polygon class="rdzone' +
          (occ ? ' occ' : '') +
          '" points="' +
          zpts +
          '"/>';
        s +=
          '<text class="rdzlbl' +
          (occ ? ' occ' : '') +
          '" x="' +
          (z.points[0][0] + 5) +
          '" y="' +
          (z.points[0][1] + 13) +
          '">' +
          esc(z.label) +
          '</text>';
      });
      var radii = rm2.ringRadii;
      for (var ri = 1; ri <= rm2.rings; ri++) {
        var rr = radii ? radii[ri - 1] : (rm2.range * ri) / rm2.rings;
        if (rdFull)
          s +=
            '<circle class="rdring" cx="' +
            rm2.sensor.x +
            '" cy="' +
            rm2.sensor.y +
            '" r="' +
            rr.toFixed(1) +
            '"/>';
        else s += '<path class="rdring" d="' + rdArc(rr) + '"/>';
      }
      if (!rdFull) {
        [rdA1, rdA2].forEach(function (a) {
          s +=
            '<line class="rdedge" x1="' +
            rm2.sensor.x +
            '" y1="' +
            rm2.sensor.y +
            '" x2="' +
            (rm2.sensor.x + rm2.range * Math.cos(a)).toFixed(1) +
            '" y2="' +
            (rm2.sensor.y + rm2.range * Math.sin(a)).toFixed(1) +
            '"/>';
        });
      }
      if (rm2.threshold != null) {
        if (rdFull)
          s +=
            '<circle class="rdthresh" cx="' +
            rm2.sensor.x +
            '" cy="' +
            rm2.sensor.y +
            '" r="' +
            rm2.threshold.toFixed(1) +
            '"/>';
        else s += '<path class="rdthresh" d="' + rdArc(rm2.threshold) + '"/>';
      }
      if (!RM) {
        var rmid = (rm2.facing * Math.PI) / 180;
        s +=
          '<g class="rdsweep" style="transform-origin:' +
          rm2.sensor.x +
          'px ' +
          rm2.sensor.y +
          'px;--sw:' +
          Math.max(0, Math.min(rm2.spread, 358) / 2 - 2).toFixed(1) +
          'deg">' +
          '<line x1="' +
          rm2.sensor.x +
          '" y1="' +
          rm2.sensor.y +
          '" x2="' +
          (rm2.sensor.x + (rm2.range - 3) * Math.cos(rmid)).toFixed(1) +
          '" y2="' +
          (rm2.sensor.y + (rm2.range - 3) * Math.sin(rmid)).toFixed(1) +
          '"/></g>';
      }
      s +=
        '<circle class="rdsensor" cx="' +
        rm2.sensor.x +
        '" cy="' +
        rm2.sensor.y +
        '" r="5"/>';
      /* track dots + connecting segments (broken at steps with no subject) */
      var seg = [];
      var flushSeg = function () {
        if (seg.length > 1)
          s += '<polyline class="rdtrack" points="' + seg.join(' ') + '"/>';
        seg = [];
      };
      rdTrack.forEach(function (p) {
        if (!p) {
          flushSeg();
          return;
        }
        seg.push(p[0] + ',' + p[1]);
        s +=
          '<circle class="rdtrackdot" cx="' +
          p[0] +
          '" cy="' +
          p[1] +
          '" r="2"/>';
      });
      flushSeg();
      if (rm2.subject) {
        s +=
          '<circle class="rdsubject ' +
          (rm2.alert ? 'alert' : 'clear') +
          '" cx="' +
          rm2.subject.x +
          '" cy="' +
          rm2.subject.y +
          '" r="6"' +
          (transient && rdMoved
            ? ' style="transform:translate(' +
              (rdPrev.x - rm2.subject.x) +
              'px,' +
              (rdPrev.y - rm2.subject.y) +
              'px)"'
            : '') +
          '/>';
        if (transient && !RM && rdFresh)
          s +=
            '<circle class="rdripple" cx="' +
            rm2.subject.x +
            '" cy="' +
            rm2.subject.y +
            '" r="6"/>';
      }
      var rstat =
        rm2.status != null
          ? rm2.status
          : rm2.subject
          ? rm2.alert
            ? 'RANGE ALERT'
            : 'CLEAR'
          : '';
      if (rstat) {
        s +=
          '<rect class="rdstatusbg ' +
          (rm2.alert ? 'alert' : 'clear') +
          (transient && rdFresh ? ' fresh' : '') +
          '" x="0" y="0" width="132" height="20"/>' +
          '<text class="rdstatustext" x="8" y="14">' +
          esc(rstat) +
          '</text>';
      }
      if (rm2.banner) {
        s +=
          '<rect class="rdbannerbg" x="0" y="150" width="320" height="30"/>' +
          '<text class="rdbannertext" x="160" y="169" text-anchor="middle">' +
          esc(rm2.banner) +
          '</text>';
      }
      return s + '</svg></div>';
    };
    h += buildRadar(true);
    hBaseline = rdFresh || rdMoved ? buildRadar(false) : null;
    return {
      html: h,
      baseline: hBaseline,
      transient: '.rdripple',
      glide: { selector: '.rdsubject', multiple: false },
    };
  }
);
