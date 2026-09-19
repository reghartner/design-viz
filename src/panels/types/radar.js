/* radar validation and pure state helpers. */
function radarPatchWarnings(obj, path, warnings) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.subject != null) {
    var cart = isFiniteNum(obj.subject.x) && isFiniteNum(obj.subject.y);
    var polar = isFiniteNum(obj.subject.r) && isFiniteNum(obj.subject.deg);
    if (!cart && !polar)
      warnings.push(
        path +
          '.subject: expected {x, y} (frame px) or {r, deg} (declared units) — subject not drawn'
      );
  }
  if (obj.threshold != null && !(isFiniteNum(obj.threshold) && obj.threshold > 0))
    warnings.push(path + '.threshold: must be a positive finite distance — re-tune ignored');
  if (obj.alert != null && typeof obj.alert !== 'boolean')
    warnings.push(path + '.alert: must be true or false — only true activates the alert');
}

PanelRegistry.extend('radar', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    radarPatchWarnings(p.initial, PP + '.initial', warnings);
    if (p.sensor && !(isFiniteNum(p.sensor.x) && isFiniteNum(p.sensor.y)))
      warnings.push(
        PP + '.sensor: expected {x, y} in the 320×180 frame — using default (bottom-mid)'
      );
    if (p.spread != null && !(isFiniteNum(p.spread) && p.spread >= 10 && p.spread <= 360))
      warnings.push(PP + '.spread: expected degrees in [10,360] — clamped');
    if (p.range != null && !(isFiniteNum(p.range) && p.range > 0))
      warnings.push(PP + '.range: must be a positive reach in the 320×180 frame — using default');
    if (p.threshold != null && !(isFiniteNum(p.threshold) && p.threshold > 0))
      warnings.push(PP + '.threshold: must be a positive distance — no alert arc drawn');
    if (p.rings != null) {
      if (Array.isArray(p.rings)) {
        if (
          !p.rings.some(function (v) {
            return isFiniteNum(v) && v > 0;
          })
        )
          warnings.push(PP + '.rings: array has no positive finite distances — using 3 rings');
      } else if (!isFiniteNum(p.rings)) {
        warnings.push(PP + '.rings: expected a count 1–6 or an array of distances — using 3');
      } else if (p.rings < 1 || p.rings > 6) {
        warnings.push(PP + '.rings: count out of range — clamped to 1–6');
      }
    }
    if (p.scale != null && !(p.scale && isFiniteNum(p.scale.pxPerUnit) && p.scale.pxPerUnit > 0))
      warnings.push(
        PP +
          '.scale: expected {pxPerUnit: <positive number>, unit: "<name>"} — scaling disabled; polar r values render as raw pixels'
      );
    if (p.zones != null) {
      if (!Array.isArray(p.zones))
        warnings.push(PP + '.zones: must be an array of {id, label, points} — ignored');
      else
        p.zones.forEach(function (z, zi) {
          var poly = z && Array.isArray(z.points) && z.points.length >= 3;
          var sector =
            z &&
            Array.isArray(z.r) &&
            z.r.length === 2 &&
            Array.isArray(z.deg) &&
            z.deg.length === 2;
          if (!z || !z.id || (!poly && !sector)) {
            warnings.push(
              PP +
                '.zones[' +
                zi +
                ']: needs {id, points:[[x,y]…] with 3+ points} or {id, r:[r0,r1], deg:[d0,d1]} — zone skipped'
            );
          } else if (sector && !poly) {
            var secOk =
              isFiniteNum(z.r[0]) &&
              isFiniteNum(z.r[1]) &&
              z.r[0] >= 0 &&
              z.r[1] > z.r[0] &&
              isFiniteNum(z.deg[0]) &&
              isFiniteNum(z.deg[1]);
            if (!secOk)
              warnings.push(
                PP +
                  '.zones[' +
                  zi +
                  ']: sector needs finite 0 <= r0 < r1 and finite degrees — zone skipped'
              );
            else if (z.deg[0] === z.deg[1])
              warnings.push(
                PP +
                  '.zones[' +
                  zi +
                  ']: sector with equal start and end degrees is degenerate — zone skipped (a full circle is deg:[0,360])'
              );
          }
        });
    }
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    radarPatchWarnings(patch, path, warnings);
  },
});

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
    panel.scale && fin(panel.scale.pxPerUnit) != null && panel.scale.pxPerUnit > 0
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
  var range = fin(panel.range) != null && panel.range > 0 ? toPx(panel.range) : 150;
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
          if (d0 === d1) return { id: z.id, label: z.label || z.id || '', points: [] };
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
  if (state.subject && fin(state.subject.x) != null && fin(state.subject.y) != null)
    subj = { x: state.subject.x, y: state.subject.y };
  else if (state.subject && fin(state.subject.r) != null && fin(state.subject.deg) != null) {
    var sp = fromPolar(state.subject.r, state.subject.deg);
    subj = { x: Math.round(sp.x * 10) / 10, y: Math.round(sp.y * 10) / 10 };
  }
  /* Alerts are authored state, independent of proximity and occupied zones.
     Sparse step folding carries the last explicit alert until it is cleared. */
  var dist = null,
    alert = state.alert === true,
    occupied = [];
  if (subj) {
    var dx = subj.x - sensor.x,
      dy = subj.y - sensor.y;
    dist = Math.sqrt(dx * dx + dy * dy);
    zones.forEach(function (z) {
      if (pointInPoly(subj.x, subj.y, z.points)) occupied.push(z.id);
    });
  }
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

PanelViews.register('radar', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var hBaseline = null;
  var rm2 = radarModel(panel, state);
  var ridx = typeof stepIdx === 'number' ? stepIdx : 0;
  /* one-shot ripple + glide fire on the clear→alert transition / a move,
       with a steady baseline stored so the following unchanged step skips
       so unchanged steps preserve ambient animation */
  var rdFresh = animate && rm2.alert && host._rdAlert === false;
  var rdPrev = host._rdPrev || null;
  var rdMoved =
    animate && rdPrev && rm2.subject && (rdPrev.x !== rm2.subject.x || rdPrev.y !== rm2.subject.y);
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
        if (!(last && last[0] === rsub.x && last[1] === rsub.y)) rdTrack.push([rsub.x, rsub.y]);
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
      s += '<polygon class="rdzone' + (occ ? ' occ' : '') + '" points="' + zpts + '"/>';
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
    s += '<circle class="rdsensor" cx="' + rm2.sensor.x + '" cy="' + rm2.sensor.y + '" r="5"/>';
    /* track dots + connecting segments (broken at steps with no subject) */
    var seg = [];
    var flushSeg = function () {
      if (seg.length > 1) s += '<polyline class="rdtrack" points="' + seg.join(' ') + '"/>';
      seg = [];
    };
    rdTrack.forEach(function (p) {
      if (!p) {
        flushSeg();
        return;
      }
      seg.push(p[0] + ',' + p[1]);
      s += '<circle class="rdtrackdot" cx="' + p[0] + '" cy="' + p[1] + '" r="2"/>';
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
          '<circle class="rdripple" cx="' + rm2.subject.x + '" cy="' + rm2.subject.y + '" r="6"/>';
    }
    var rstat =
      rm2.status != null ? rm2.status : rm2.alert ? 'RANGE ALERT' : rm2.subject ? 'CLEAR' : '';
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
});

PanelRegistry.extend('radar', {
  order: 15,
  label: 'Radar',
  since: '0.1.0',
});

PanelRegistry.extend('radar', {
  styles: [
    {
      order: 827,
      css: String.raw`.rdbox{border-radius:8px; overflow:hidden;}
.rdframe{display:block; width:100%; height:auto;}
.rdbg{fill:#0A0F14;}
.rdring{fill:none; stroke:#22314A; stroke-width:1.2;}
.rdedge{stroke:#22314A; stroke-width:1.2;}
.rdthresh{fill:none; stroke:#FFB454; stroke-width:1.5; stroke-dasharray:5 4;}
.rdzone{fill:rgba(94,115,150,.08); stroke:#3B4A63; stroke-width:1.2; stroke-dasharray:4 4;}
.rdzone.occ{fill:rgba(56,225,255,.14); stroke:#38E1FF; stroke-dasharray:none;}
.rdzlbl{font:600 9px 'IBM Plex Mono',monospace; fill:#55627A;}
.rdzlbl.occ{fill:#8AE8FF;}
.rdsweep line{stroke:#38E1FF; stroke-width:1.2; opacity:.28; stroke-linecap:round;}
.rdsweep{transform-box:view-box; animation:sensorSweep 3.2s ease-in-out infinite alternate;}
.rdsensor{fill:#38E1FF; filter:drop-shadow(0 0 4px rgba(56,225,255,.85));}
.rdtrack{fill:none; stroke:#5E7396; stroke-width:1.2; stroke-dasharray:2 4;}
.rdtrackdot{fill:#5E7396;}
.rdsubject{stroke:#0A0F14; stroke-width:1.5; transition:transform .7s cubic-bezier(.4,0,.2,1);}
.rdsubject.clear{fill:#94A3B8;}
.rdsubject.alert{fill:#FFB454; filter:drop-shadow(0 0 5px rgba(255,180,84,.9));}
.rdripple{fill:none; stroke:#FFB454; stroke-width:2; animation:sensorRipple 1s ease-out both;}
.rdstatusbg{opacity:.92;}
.rdstatusbg.clear{fill:#334155;}
.rdstatusbg.alert{fill:#B45309;}
.rdstatusbg.alert.fresh{animation:ledpulse .3s ease-in-out 4 alternate;}
.rdstatustext{font:700 10px 'IBM Plex Mono',monospace; fill:#F8FAFC; letter-spacing:.05em;}
.rdbannerbg{fill:#0F172A; opacity:.9;}
.rdbannertext{font:700 10px 'IBM Plex Mono',monospace; fill:#F8FAFC; letter-spacing:.04em;}`,
    },
    {
      order: 1217,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .rdsweep, .rdripple, .rdstatusbg{animation:none !important;}
}`,
    },
    {
      order: 1401,
      css: String.raw`body.sk-editorial .rdring,
body.sk-editorial .rdedge{stroke:#C3B9A9;}
body.sk-editorial .rdthresh{stroke:var(--ed-warn);}
body.sk-editorial .rdzone{fill:rgba(93,103,99,.05); stroke:#8B8F88;}
body.sk-editorial .rdzone.occ{fill:rgba(14,91,86,.12); stroke:var(--ed-accent);}
body.sk-editorial .rdzlbl{fill:#696E69;}
body.sk-editorial .rdzlbl.occ{fill:var(--ed-accent-deep);}
body.sk-editorial .rdtrack{stroke:#6F7975;}
body.sk-editorial .rdtrackdot{fill:#6F7975;}
body.sk-editorial .rdsubject{stroke:#EFE8DC;}`,
    },
    {
      order: 1672,
      css: String.raw`@media screen {

  body.sk-terminal .rdring,
  body.sk-terminal .rdedge{stroke:var(--tm-line);}
}
@media screen {
  body.sk-terminal .rdthresh{stroke:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .rdzone{fill:rgba(116,135,126,.05); stroke:var(--tm-line);}
}
@media screen {
  body.sk-terminal .rdzone.occ{fill:rgba(94,235,154,.09); stroke:var(--tm-good);}
}
@media screen {
  body.sk-terminal .rdzlbl{fill:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .rdzlbl.occ{fill:var(--tm-good);}
}
@media screen {
  body.sk-terminal .rdtrackdot{fill:var(--tm-muted);}
}`,
    },
    {
      order: 1830,
      css: String.raw`@media screen {
  body.sk-pastel .rdring,
  body.sk-pastel .rdedge { stroke:#344A67; }
}
@media screen {
  body.sk-pastel .rdthresh { stroke:#F0BE78; }
}
@media screen {
  body.sk-pastel .rdzone { fill:rgba(137,159,187,.08); stroke:#627793; }
}
@media screen {
  body.sk-pastel .rdzone.occ { fill:rgba(130,203,224,.15); stroke:#82CBE0; }
}
@media screen {
  body.sk-pastel .rdzlbl { fill:#7F94AD; }
}
@media screen {
  body.sk-pastel .rdzlbl.occ { fill:#B8E5F1; }
}
@media screen {
  body.sk-pastel .rdtrack { stroke:#7F94AD; }
}
@media screen {
  body.sk-pastel .rdtrackdot { fill:#7F94AD; }
}`,
    },
    {
      order: 2066,
      css: String.raw`@media screen {
  body.sk-blueprint .rdring,body.sk-blueprint .rdedge{stroke:#346F91;}
}
@media screen {
  body.sk-blueprint .rdzone{fill:rgba(105,187,209,.07);stroke:#5D9DB8;}
}
@media screen {
  body.sk-blueprint .rdzone.occ{fill:rgba(88,231,255,.14);stroke:#58E7FF;}
}
@media screen {
  body.sk-blueprint .rdzlbl{fill:#86B3CA;}
}
@media screen {
  body.sk-blueprint .rdzlbl.occ{fill:#D8FAFF;}
}
@media screen {
  body.sk-blueprint .docview .rdtrack{fill:none;stroke:#91BDD1;}
}
@media screen {
  body.sk-blueprint .docview .rdtrackdot{fill:#91BDD1;}
}`,
    },
  ],
});

/* radar authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('radar', {
  authoring: {
    template: { title: 'Radar' },
    setupFields: [
      ['sensor', 'json'],
      ['facing', 'num'],
      ['spread', 'num'],
      ['range', 'num'],
      ['threshold', 'num'],
      ['rings', 'jsonAny'],
      ['scale', 'json'],
      ['zones', 'jsonArr'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['subject', 'json'],
      ['threshold', 'num'],
      ['alert', 'bool'],
      ['status', 'text'],
      ['banner', 'text'],
    ],
    picker: {
      order: 18,
      name: 'Range radar',
      category: 'Places & sensing',
      tagline: 'Distance makes the difference',
      description: 'Show measured range, occupied zones, and a reference threshold. Turn alerts on or off explicitly in each step.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { subject: { x: 195, y: 90 }, alert: true };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
