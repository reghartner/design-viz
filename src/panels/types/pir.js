/* pir validation and pure state helpers. */

PanelRegistry.extend('pir', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    var pc = p.cone || {};
    if (typeof pc.spread === 'number' && (pc.spread <= 0 || pc.spread >= 360))
      warnings.push(PP + '.cone.spread: expected degrees in (0,360) — clamped');
    if (typeof pc.range === 'number' && pc.range <= 0)
      warnings.push(
        PP + '.cone.range: must be a positive reach in the 320×180 frame — using default'
      );
    if (p.sensor && (typeof p.sensor.x !== 'number' || typeof p.sensor.y !== 'number'))
      warnings.push(
        PP + '.sensor: expected {x, y} in the 320×180 frame — using default (right-mid)'
      );
    if (p.path != null && !(Array.isArray(p.path) && p.path.length >= 2))
      warnings.push(PP + '.path: expected [[x,y]…] with 2+ points — path not drawn');
  },
});

/* pir panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function pirModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var sensor =
    panel.sensor && typeof panel.sensor.x === 'number' && typeof panel.sensor.y === 'number'
      ? { x: panel.sensor.x, y: panel.sensor.y }
      : { x: 298, y: 78 };
  var cone = panel.cone || {};
  var facing = typeof cone.facing === 'number' ? cone.facing : 180;
  var spread = typeof cone.spread === 'number' ? clamp(cone.spread, 4, 340) : 66;
  var range = typeof cone.range === 'number' && cone.range > 0 ? cone.range : 250;
  var f = (facing * Math.PI) / 180;
  var half = ((spread / 2) * Math.PI) / 180;
  var N = 16,
    pts = [[sensor.x, sensor.y]];
  for (var i = 0; i <= N; i++) {
    var a = f - half + 2 * half * (i / N);
    pts.push([sensor.x + range * Math.cos(a), sensor.y + range * Math.sin(a)]);
  }
  var subj =
    state.subject && typeof state.subject.x === 'number' && typeof state.subject.y === 'number'
      ? { x: state.subject.x, y: state.subject.y }
      : null;
  var tripped = false;
  if (subj) {
    var dx = subj.x - sensor.x,
      dy = subj.y - sensor.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) {
      tripped = true;
    } else if (dist <= range) {
      var diff = Math.abs(
        Math.atan2(Math.sin(Math.atan2(dy, dx) - f), Math.cos(Math.atan2(dy, dx) - f))
      );
      if (diff <= half) tripped = true;
    }
  }
  if (state.tripped === true) tripped = true;
  if (state.tripped === false) tripped = false;
  return {
    sensor: sensor,
    cone: { facing: facing, spread: spread, range: range },
    conePoints: pts,
    subject: subj,
    tripped: tripped,
    path: (function () {
      var pp = (Array.isArray(panel.path) ? panel.path : []).filter(function (p) {
        return (
          Array.isArray(p) &&
          typeof p[0] === 'number' &&
          isFinite(p[0]) &&
          typeof p[1] === 'number' &&
          isFinite(p[1])
        );
      });
      return pp.length >= 2 ? pp : null;
    })(),
    banner: state.banner != null ? String(state.banner) : '',
    status: state.status != null ? String(state.status) : null,
  };
}

/* thermo widget: a device temperature readout against warning / critical
   shutdown thresholds. Pure model (node-testable, no DOM). The engine COMPUTES
   the zone (ok / warn / crit) from the value and the declared thresholds
   rather than trusting the author to assert it; `state.label` overrides only
   the zone-chip caption. A missing value renders as a dash (zone 'na').
   Reversed warn/crit are swapped (the validator warns). */

PanelViews.register('pir', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var hBaseline = null;
  var pm = pirModel(panel, state);
  var trip = pm.tripped ? 'tripped' : 'clear';
  /* one-shot cues (cone flash, subject ripple, status blink) fire only on a
       clear→tripped transition, not on every re-render while tripped and not
       on a first render that starts tripped (host._pirTrip === false means
       the PREVIOUS render was explicitly clear; undefined means no previous
       render). The previous render's tripped/subject live on the host. */
  var pirFresh = animate && pm.tripped && host._pirTrip === false;
  var pirPrev = host._pirPrev || null;
  var pirMoved =
    animate && pirPrev && pm.subject && (pirPrev.x !== pm.subject.x || pirPrev.y !== pm.subject.y);
  host._pirTrip = pm.tripped;
  host._pirPrev = pm.subject ? { x: pm.subject.x, y: pm.subject.y } : null;
  /* the widget markup is built twice: once WITH the one-shot transients
       (fresh classes, ghost, trail, ripple, glide offset) for the DOM, and
       once WITHOUT them as the comparison baseline (hBaseline) — the step
       AFTER a trip or a move produces exactly the steady form, so it matches
       the baseline and skips the rebuild instead of restarting the ambient
       sweep/ping animations. */
  var buildPir = function (transient) {
    var s =
      '<div class="pirbox"><svg class="pirframe" viewBox="0 0 320 180" role="img" aria-label="' +
      esc(panel.title || 'IR sensor line of sight') +
      '">';
    s +=
      '<rect width="320" height="180" class="pirbg"/><rect y="150" width="320" height="30" class="pirground"/>';
    if (pm.path)
      s +=
        '<path class="pirpath" d="M' +
        pm.path
          .map(function (p) {
            return p[0] + ' ' + p[1];
          })
          .join(' L') +
        '"/>';
    s +=
      '<polygon class="pircone ' +
      trip +
      (transient && pirFresh ? ' fresh' : '') +
      '" points="' +
      cpts +
      '"/>';
    /* scanning beam sweeping the cone + detection pings from the sensor —
         ambient life while the step is parked; suppressed under reduced motion */
    if (!RM) {
      var fr = (pm.cone.facing * Math.PI) / 180;
      var swx = pm.sensor.x + (pm.cone.range - 4) * Math.cos(fr);
      var swy = pm.sensor.y + (pm.cone.range - 4) * Math.sin(fr);
      s +=
        '<g class="pirsweep ' +
        trip +
        '" style="transform-origin:' +
        pm.sensor.x +
        'px ' +
        pm.sensor.y +
        'px;--sw:' +
        Math.max(0, pm.cone.spread / 2 - 3).toFixed(1) +
        'deg">' +
        '<line x1="' +
        pm.sensor.x +
        '" y1="' +
        pm.sensor.y +
        '" x2="' +
        swx.toFixed(1) +
        '" y2="' +
        swy.toFixed(1) +
        '"/></g>';
      s +=
        '<circle class="pirping" cx="' +
        pm.sensor.x +
        '" cy="' +
        pm.sensor.y +
        '" r="5"/>' +
        '<circle class="pirping p2" cx="' +
        pm.sensor.x +
        '" cy="' +
        pm.sensor.y +
        '" r="5"/>';
    }
    s += '<circle class="pirsensor" cx="' + pm.sensor.x + '" cy="' + pm.sensor.y + '" r="5"/>';
    s +=
      '<text class="pirsensorlbl" x="' +
      (pm.sensor.x - 9) +
      '" y="' +
      (pm.sensor.y - 8) +
      '" text-anchor="end">IR</text>';
    if (pm.subject) {
      /* between steps the subject glides from its previous position: it is
           rendered offset back to the old spot via an inline transform, which
           the post-render hook releases on the next frame (CSS transition).
           A fading ghost + dashed trail mark where it came from. */
      if (transient && pirMoved) {
        s +=
          '<line class="pirtrail" x1="' +
          pirPrev.x +
          '" y1="' +
          pirPrev.y +
          '" x2="' +
          pm.subject.x +
          '" y2="' +
          pm.subject.y +
          '"/>';
        s += '<circle class="pirghost" cx="' + pirPrev.x + '" cy="' + pirPrev.y + '" r="6"/>';
      }
      s +=
        '<circle class="pirsubject ' +
        trip +
        '" cx="' +
        pm.subject.x +
        '" cy="' +
        pm.subject.y +
        '" r="6"' +
        (transient && pirMoved
          ? ' style="transform:translate(' +
            (pirPrev.x - pm.subject.x) +
            'px,' +
            (pirPrev.y - pm.subject.y) +
            'px)"'
          : '') +
        '/>';
      if (transient && !RM && pirFresh)
        s +=
          '<circle class="pirripple" cx="' + pm.subject.x + '" cy="' + pm.subject.y + '" r="6"/>';
    }
    var pstat =
      pm.status != null ? pm.status : pm.subject ? (pm.tripped ? 'IR TRIPPED' : 'IR CLEAR') : '';
    if (pstat) {
      s +=
        '<rect class="pirstatusbg ' +
        trip +
        (transient && pirFresh ? ' fresh' : '') +
        '" x="0" y="0" width="132" height="20"/>' +
        '<text class="pirstatustext" x="8" y="14">' +
        esc(pstat) +
        '</text>';
    }
    if (pm.banner) {
      s +=
        '<rect class="pirbannerbg" x="0" y="150" width="320" height="30"/>' +
        '<text class="pirbannertext" x="160" y="169" text-anchor="middle">' +
        esc(pm.banner) +
        '</text>';
    }
    return s + '</svg></div>';
  };
  var cpts = pm.conePoints
    .map(function (p) {
      return p[0].toFixed(1) + ',' + p[1].toFixed(1);
    })
    .join(' ');
  var pirTransients = pirFresh || pirMoved;
  h += buildPir(true);
  hBaseline = pirTransients ? buildPir(false) : null;
  return {
    html: h,
    baseline: hBaseline,
    transient: '.pirghost,.pirtrail,.pirripple',
    glide: { selector: '.pirsubject', multiple: false },
  };
});

PanelRegistry.extend('pir', {
  order: 11,
  label: 'Motion sensor',
  since: '0.1.0',
});

PanelRegistry.extend('pir', {
  styles: [
    {
      order: 647,
      css: String.raw`.pirbox{border-radius:8px; overflow:hidden;}
.pirframe{display:block; width:100%; height:auto;}
.pirbg{fill:#0A0F14;}
.pirground{fill:#131A21;}
.pirpath{fill:none; stroke:#334155; stroke-width:2; stroke-dasharray:4 5;}
.pircone{stroke-width:1.5;}
.pircone.clear{fill:rgba(94,115,150,.13); stroke:#5E7396; stroke-dasharray:6 4;}
.pircone.tripped{fill:rgba(255,180,84,.20); stroke:#FFB454;}
.pirsensor{fill:#38E1FF; filter:drop-shadow(0 0 4px rgba(56,225,255,.85));}
.pirsensorlbl{font:600 9px 'IBM Plex Mono',monospace; fill:#8AE8FF;}
.pirsubject{stroke:#0A0F14; stroke-width:1.5;}
.pirsubject.clear{fill:#94A3B8;}
.pirsubject.tripped{fill:#FFB454; filter:drop-shadow(0 0 5px rgba(255,180,84,.9));}
.pirstatusbg{opacity:.92;}
.pirstatusbg.clear{fill:#334155;}
.pirstatusbg.tripped{fill:#B45309;}
.pirstatustext{font:700 10px 'IBM Plex Mono',monospace; fill:#F8FAFC; letter-spacing:.05em;}
.pirbannerbg{fill:#0F172A; opacity:.9;}
.pirbannertext{font:700 10px 'IBM Plex Mono',monospace; fill:#F8FAFC; letter-spacing:.04em;}`,
    },
    {
      order: 667,
      css: String.raw`.pirsubject{transition:transform .7s cubic-bezier(.4,0,.2,1);}
.pircone.clear{animation:pirbreathe 3.4s ease-in-out infinite alternate;}
@keyframes pirbreathe{to{opacity:.6;}}
.pircone.tripped.fresh{animation:pirconeflash .6s ease-out;}
@keyframes pirconeflash{from{fill:rgba(255,180,84,.5);}}
.pirsweep line{stroke:#38E1FF; stroke-width:1.2; opacity:.28; stroke-linecap:round;}
.pirsweep.tripped line{stroke:#FFB454; opacity:.4;}
.pirsweep{transform-box:view-box; animation:pirsweep 2.8s ease-in-out infinite alternate;}`,
    },
    {
      order: 676,
      css: String.raw`.pirping{fill:none; stroke:#38E1FF; stroke-width:1.2; animation:pirping 2.4s ease-out infinite;}
.pirping.p2{animation-delay:1.2s;}`,
    },
    {
      order: 679,
      css: String.raw`.pirghost{fill:#94A3B8; animation:pirfade 1.3s ease-out forwards;}
.pirtrail{stroke:#94A3B8; stroke-width:1.5; stroke-dasharray:3 4; animation:pirfade 1.3s ease-out forwards;}`,
    },
    {
      order: 682,
      css: String.raw`.pirripple{fill:none; stroke:#FFB454; stroke-width:2; animation:pirripple 1s ease-out both;}`,
    },
    {
      order: 684,
      css: String.raw`.pirstatusbg.tripped.fresh{animation:ledpulse .3s ease-in-out 4 alternate;}`,
    },
    {
      order: 1210,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .pircone, .pirsweep, .pirping, .pirghost, .pirtrail, .pirripple, .pirstatusbg{animation:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .pirsubject{transition:none !important;}
}`,
    },
    {
      order: 1385,
      css: String.raw`body.sk-editorial .pirground{fill:#E2D8C8;}
body.sk-editorial .pirpath{stroke:#9E968A;}
body.sk-editorial .pircone.clear{fill:rgba(14,91,86,.08); stroke:#66807B;}
body.sk-editorial .pircone.tripped{fill:rgba(152,99,24,.15); stroke:var(--ed-warn);}`,
    },
    {
      order: 1390,
      css: String.raw`body.sk-editorial .pirsensorlbl{fill:var(--ed-accent-deep);}
body.sk-editorial .pirsubject{stroke:#EFE8DC;}`,
    },
    {
      order: 1395,
      css: String.raw`body.sk-editorial .pirping{stroke:var(--ed-accent);}
body.sk-editorial .pirghost{fill:#818780;}
body.sk-editorial .pirtrail{stroke:#818780;}`,
    },
    {
      order: 1607,
      css: String.raw`@media screen {
  body.sk-terminal .pirground{fill:var(--tm-raised);}
}`,
    },
    {
      order: 1609,
      css: String.raw`@media screen {
  body.sk-terminal .pircone.clear{fill:rgba(116,135,126,.08); stroke:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .pircone.tripped{fill:rgba(255,107,94,.13); stroke:var(--tm-alert);}
}`,
    },
    {
      order: 1612,
      css: String.raw`@media screen {
  body.sk-terminal .pirsensorlbl{fill:var(--tm-good);}
}`,
    },
    {
      order: 1817,
      css: String.raw`@media screen {
  body.sk-pastel .pirground { fill:#1A2940; }
}
@media screen {
  body.sk-pastel .pirpath { stroke:#52657E; }
}
@media screen {
  body.sk-pastel .pircone.clear { fill:rgba(138,166,197,.13); stroke:#7F97B2; }
}
@media screen {
  body.sk-pastel .pircone.tripped { fill:rgba(240,190,120,.19); stroke:#F0BE78; }
}`,
    },
    {
      order: 1822,
      css: String.raw`@media screen {
  body.sk-pastel .pirsensorlbl { fill:#B8E5F1; }
}`,
    },
    {
      order: 2057,
      css: String.raw`@media screen {
  body.sk-blueprint .pirground{fill:#052956;}
}
@media screen {
  body.sk-blueprint .pirpath{stroke:#6A9FB9;}
}
@media screen {
  body.sk-blueprint .pircone.clear{fill:rgba(93,190,216,.11);stroke:#69BBD1;}
}
@media screen {
  body.sk-blueprint .pircone.tripped{fill:rgba(255,209,102,.2);stroke:#FFD166;}
}`,
    },
    {
      order: 2062,
      css: String.raw`@media screen {
  body.sk-blueprint .pirsensorlbl{fill:#BFF5FF;}
}`,
    },
  ],
});

/* pir authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('pir', {
  authoring: {
    template: { title: 'Motion cone' },
    setupFields: [
      ['cone', 'json'],
      ['sensor', 'json'],
      ['path', 'jsonArr'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['subject', 'json'],
      ['tripped', 'bool'],
      ['status', 'text'],
      ['banner', 'text'],
    ],
    picker: {
      order: 17,
      name: 'Motion sensor',
      category: 'Places & sensing',
      tagline: 'Inside the motion cone',
      description: 'Show a subject entering or leaving a passive infrared sensor’s field of view.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { subject: { x: 188, y: 88 }, tripped: true };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
