/* thermo validation and pure state helpers. */
/* Shared threshold normalization: old hot-only specs keep their exact behavior. */
function thermoLimits(panel) {
  var min = isFiniteNum(panel.min) ? panel.min : 0;
  var max = isFiniteNum(panel.max) && panel.max > min ? panel.max : min + 100;
  function bound(v) {
    return isFiniteNum(v) ? Math.min(max, Math.max(min, v)) : null;
  }
  var warn = bound(panel.warn),
    crit = bound(panel.crit);
  var lowWarn = bound(panel.lowWarn),
    lowCrit = bound(panel.lowCrit),
    swap;
  if (warn !== null && crit !== null && warn > crit) {
    swap = warn;
    warn = crit;
    crit = swap;
  }
  if (lowWarn !== null && lowCrit !== null && lowCrit > lowWarn) {
    swap = lowWarn;
    lowWarn = lowCrit;
    lowCrit = swap;
  }
  var coldEnd = lowWarn !== null ? lowWarn : lowCrit,
    hotStart = warn !== null ? warn : crit;
  var overlap = coldEnd !== null && hotStart !== null && coldEnd >= hotStart;
  if (overlap) lowWarn = lowCrit = null;
  return {
    min: min,
    max: max,
    warn: warn,
    crit: crit,
    lowWarn: lowWarn,
    lowCrit: lowCrit,
    overlap: overlap,
  };
}

PanelRegistry.extend('thermo', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    ['min', 'max', 'warn', 'crit', 'lowWarn', 'lowCrit'].forEach(function (tk) {
      if (p[tk] != null && !isFiniteNum(p[tk]))
        warnings.push(PP + '.' + tk + ': must be a finite number — ignored');
    });
    var tmin = isFiniteNum(p.min) ? p.min : 0;
    if (isFiniteNum(p.max) && p.max <= tmin)
      warnings.push(PP + '.max: must exceed min — using min+100');
    if (isFiniteNum(p.warn) && isFiniteNum(p.crit) && p.warn > p.crit)
      warnings.push(PP + ': warn exceeds crit — thresholds swapped at render');
    if (isFiniteNum(p.lowWarn) && isFiniteNum(p.lowCrit) && p.lowCrit > p.lowWarn)
      warnings.push(PP + ': lowCrit exceeds lowWarn — cold thresholds swapped at render');
    if (thermoLimits(p).overlap)
      warnings.push(
        PP + ': cold and hot ranges overlap — cold thresholds ignored; leave a safe interval'
      );
    if (p.initial && p.initial.value != null && !isFiniteNum(p.initial.value))
      warnings.push(PP + '.initial.value: must be a finite number — rendered as NO DATA');
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    if (patch.value != null && !isFiniteNum(patch.value))
      warnings.push(path + '.value: must be a finite number — rendered as NO DATA');
  },
});

/* thermo panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var THERMO_ZONE_LABELS = {
  ok: 'NOMINAL',
  warn: 'WARNING',
  crit: 'CRITICAL',
  'cold-warn': 'COLD WARNING',
  'cold-crit': 'TOO COLD',
  na: 'NO DATA',
};
function thermoModel(panel, state) {
  panel = panel || {};
  state = state || {};
  /* finite-only: JSON overflow literals (1e400) parse to Infinity, which is
     typeof 'number' but would poison every percentage into NaN and emit
     invalid SVG/CSS attribute values — treat non-finite as absent */
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  var limits = thermoLimits(panel),
    min = limits.min,
    max = limits.max;
  var warn = limits.warn,
    crit = limits.crit,
    lowWarn = limits.lowWarn,
    lowCrit = limits.lowCrit;
  var value = fin(state.value);
  var zone = 'na';
  if (value != null) {
    zone = 'ok';
    if (lowWarn != null && value <= lowWarn) zone = 'cold-warn';
    if (lowCrit != null && value <= lowCrit) zone = 'cold-crit';
    if (warn != null && value >= warn) zone = 'warn';
    if (crit != null && value >= crit) zone = 'crit';
  }
  function pct(v) {
    return clamp(((v - min) / (max - min)) * 100, 0, 100);
  }
  return {
    value: value,
    min: min,
    max: max,
    warn: warn,
    crit: crit,
    lowWarn: lowWarn,
    lowCrit: lowCrit,
    zone: zone,
    unit: panel.unit != null ? String(panel.unit) : '°C',
    pct: value != null ? pct(value) : 0,
    warnPct: warn != null ? pct(warn) : null,
    critPct: crit != null ? pct(crit) : null,
    lowWarnPct: lowWarn != null ? pct(lowWarn) : null,
    lowCritPct: lowCrit != null ? pct(lowCrit) : null,
    label: state.label != null ? String(state.label) : THERMO_ZONE_LABELS[zone],
  };
}

/* battery widget: charge level where LOW is bad — the inverse of thermo's
   zones. Pure model (node-testable). The engine COMPUTES the zone (ok / low /
   crit, both thresholds inclusive at-or-below) from the charge and the
   declared thresholds; `state.label` overrides only the zone-chip caption.
   Non-finite numbers (JSON 1e400 → Infinity) are treated as absent. Charge
   is a percentage, clamped to 0–100. Reversed thresholds (crit > low) are
   swapped (the validator warns). */

PanelViews.register('thermo', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var tm = thermoModel(panel, state);
  var idx = typeof stepIdx === 'number' ? stepIdx : 0;
  var tv = tm.value != null ? String(Math.round(tm.value * 10) / 10) : null;
  h +=
    '<div class="thhead"><div class="thval z-' +
    tm.zone +
    '">' +
    (tv != null ? esc(tv) : '&#8212;') +
    '<span class="thunit">' +
    esc(tm.unit) +
    '</span></div>' +
    '<span class="thzone z-' +
    tm.zone +
    '">' +
    esc(tm.label) +
    '</span></div>';
  /* threshold track: shaded warn/crit bands under the value fill, threshold
       ticks over it, numeric scale beneath */
  h += '<div class="thbar">';
  if (tm.lowWarnPct != null || tm.lowCritPct != null) {
    var safeStart = tm.lowWarnPct != null ? tm.lowWarnPct : tm.lowCritPct;
    var safeEnd = tm.warnPct != null ? tm.warnPct : tm.critPct != null ? tm.critPct : 100;
    h +=
      '<span class="thband safe" style="left:' +
      safeStart.toFixed(1) +
      '%;width:' +
      (safeEnd - safeStart).toFixed(1) +
      '%"></span>';
  }
  if (tm.lowWarnPct != null)
    h +=
      '<span class="thband cold-warn" style="left:' +
      (tm.lowCritPct || 0).toFixed(1) +
      '%;width:' +
      (tm.lowWarnPct - (tm.lowCritPct || 0)).toFixed(1) +
      '%"></span>';
  if (tm.lowCritPct != null)
    h +=
      '<span class="thband cold-crit" style="left:0;width:' +
      tm.lowCritPct.toFixed(1) +
      '%"></span>';
  if (tm.warnPct != null)
    h +=
      '<span class="thband warn" style="left:' +
      tm.warnPct.toFixed(1) +
      '%;width:' +
      ((tm.critPct != null ? tm.critPct : 100) - tm.warnPct).toFixed(1) +
      '%"></span>';
  if (tm.critPct != null)
    h +=
      '<span class="thband crit" style="left:' +
      tm.critPct.toFixed(1) +
      '%;width:' +
      (100 - tm.critPct).toFixed(1) +
      '%"></span>';
  if (tm.value != null)
    h += '<span class="thfill z-' + tm.zone + '" style="width:' + tm.pct.toFixed(1) + '%"></span>';
  if (tm.warnPct != null)
    h += '<span class="thtick warn" style="left:' + tm.warnPct.toFixed(1) + '%"></span>';
  if (tm.critPct != null)
    h += '<span class="thtick crit" style="left:' + tm.critPct.toFixed(1) + '%"></span>';
  ['lowWarn', 'lowCrit'].forEach(function (key) {
    if (tm[key] != null)
      h +=
        '<span class="thtick ' +
        (key === 'lowWarn' ? 'cold-warn' : 'cold-crit') +
        '" style="left:' +
        tm[key + 'Pct'].toFixed(1) +
        '%" title="' +
        (key === 'lowWarn' ? 'Cold warning' : 'Cold critical') +
        ': ' +
        esc(String(tm[key]) + tm.unit) +
        '"></span>';
  });
  h += '</div>';
  h += '<div class="thscale"><span class="lo">' + esc(String(tm.min)) + '</span>';
  if (tm.warn != null)
    h +=
      '<span class="warn" style="left:' +
      tm.warnPct.toFixed(1) +
      '%">' +
      esc(String(tm.warn)) +
      '</span>';
  if (tm.crit != null)
    h +=
      '<span class="crit" style="left:' +
      tm.critPct.toFixed(1) +
      '%">' +
      esc(String(tm.crit)) +
      '</span>';
  ['lowWarn', 'lowCrit'].forEach(function (key) {
    if (tm[key] != null)
      h +=
        '<span class="' +
        (key === 'lowWarn' ? 'cold-warn' : 'cold-crit') +
        '" style="left:' +
        tm[key + 'Pct'].toFixed(1) +
        '%">' +
        esc(String(tm[key])) +
        '</span>';
  });
  h += '<span class="hi">' + esc(String(tm.max)) + '</span></div>';
  if (tm.lowWarn != null || tm.lowCrit != null)
    h +=
      '<div class="thrange-key"><span>Cold limits</span><span>Safe interval</span><span>' +
      (tm.warn != null || tm.crit != null ? 'Hot limits' : '') +
      '</span></div>';
  /* step-history sparkline: every step's value plots as a faint frame (dots
       + ghost line) so the axis is stable; the bright line and dots reveal
       only up to the current step, so stepping tells the thermal story and a
       jump to any step re-renders consistently */
  /* same finite-only rule as thermoModel: an Infinity value renders as
       NO DATA in the readout, so it must not plot as a history point either */
  var hist = Array.isArray(states)
    ? states.map(function (s) {
        return s && typeof s.value === 'number' && isFinite(s.value) ? s.value : null;
      })
    : [];
  if (hist.length > 1) {
    var sX = function (i) {
      return 6 + (248 * i) / (hist.length - 1);
    };
    var sY = function (vv) {
      return 54 - clamp((vv - tm.min) / (tm.max - tm.min), 0, 1) * 46;
    };
    h += '<svg class="thspark" viewBox="0 0 260 62" role="img" aria-label="temperature per step">';
    ['lowWarn', 'lowCrit'].forEach(function (key) {
      if (tm[key] != null)
        h +=
          '<line class="thguide ' +
          (key === 'lowWarn' ? 'cold-warn' : 'cold-crit') +
          '" x1="6" x2="254" y1="' +
          sY(tm[key]).toFixed(1) +
          '" y2="' +
          sY(tm[key]).toFixed(1) +
          '"/>';
    });
    if (tm.warn != null)
      h +=
        '<line class="thguide warn" x1="6" x2="254" y1="' +
        sY(tm.warn).toFixed(1) +
        '" y2="' +
        sY(tm.warn).toFixed(1) +
        '"/>';
    if (tm.crit != null)
      h +=
        '<line class="thguide crit" x1="6" x2="254" y1="' +
        sY(tm.crit).toFixed(1) +
        '" y2="' +
        sY(tm.crit).toFixed(1) +
        '"/>';
    /* a null slot (step with no finite value) BREAKS the line: segments are
         emitted per run of consecutive finite values, so the line never
         bridges a no-data step */
    var ghostSegs = [],
      litSegs = [],
      gSeg = null,
      lSeg = null;
    hist.forEach(function (vv, i) {
      if (vv == null) {
        gSeg = null;
        lSeg = null;
        return;
      }
      var pt = sX(i).toFixed(1) + ',' + sY(vv).toFixed(1);
      if (!gSeg) {
        gSeg = [];
        ghostSegs.push(gSeg);
      }
      gSeg.push(pt);
      if (i <= idx) {
        if (!lSeg) {
          lSeg = [];
          litSegs.push(lSeg);
        }
        lSeg.push(pt);
      } else lSeg = null;
    });
    ghostSegs.forEach(function (seg) {
      if (seg.length > 1) h += '<polyline class="thline ghost" points="' + seg.join(' ') + '"/>';
    });
    litSegs.forEach(function (seg) {
      if (seg.length > 1) h += '<polyline class="thline" points="' + seg.join(' ') + '"/>';
    });
    hist.forEach(function (vv, i) {
      if (vv == null) return;
      var zc = thermoModel(panel, { value: vv }).zone;
      var isCur = i === idx;
      h +=
        '<circle class="thdot z-' +
        zc +
        (i <= idx ? ' on' : '') +
        (isCur ? ' cur' : '') +
        '" cx="' +
        sX(i).toFixed(1) +
        '" cy="' +
        sY(vv).toFixed(1) +
        '" r="' +
        (isCur ? 4 : 2.4) +
        '"/>';
    });
    h += '</svg>';
  }
  return {
    html: h,
    level: {
      pct: tm.pct,
      value: tm.value,
      settled: tv,
      fill: '.thfill',
      readout: '.thval',
      decimals: 1,
    },
  };
});

PanelRegistry.extend('thermo', {
  order: 12,
  label: 'Temperature',
  since: '0.1.0',
});

PanelRegistry.extend('thermo', {
  styles: [
    {
      order: 686,
      css: String.raw`.thhead{display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:8px;}
.thval{font:700 20px 'IBM Plex Mono',monospace;}
.thunit{font-size:11px; font-weight:500; opacity:.6; margin-left:3px;}
.sk-aurora .thval{color:#EAF2FF;}
.sk-daylight .thval{color:#23272E;}
.sk-aurora .thval.z-warn{color:#FFB454;}
.sk-daylight .thval.z-warn{color:#B0771A;}
.sk-aurora .thval.z-crit{color:#FF6B5E;}
.sk-daylight .thval.z-crit{color:#B91C1C;}
.thval.z-na{opacity:.4;}
.thzone{font:700 9.5px 'IBM Plex Mono',monospace; letter-spacing:.08em; padding:3px 8px; border-radius:6px; border:1px solid transparent; white-space:nowrap;}
.sk-aurora .thzone.z-ok{color:#4ADE80; border-color:#1E4A33; background:#0C2418;}
.sk-daylight .thzone.z-ok{color:#0E7A3C; border-color:#BFE3CC; background:#EAF7EF;}
.sk-aurora .thzone.z-warn{color:#FFB454; border-color:#5A431C; background:#2A2010;}
.sk-daylight .thzone.z-warn{color:#B0771A; border-color:#EAD9B0; background:#FBF3E0;}
.sk-aurora .thzone.z-crit{color:#FF6B5E; border-color:#5F2320; background:#2C1210;}
.sk-daylight .thzone.z-crit{color:#B91C1C; border-color:#EFC4C0; background:#FBEBEA;}
.thzone.z-crit{animation:ledpulse .6s ease-in-out infinite alternate;}
.sk-aurora .thzone.z-na{color:#55627A; border-color:#1D2A40; background:#101A2C;}
.sk-daylight .thzone.z-na{color:#9A958A; border-color:#E0DCD1; background:#F4F2EC;}
.thbar{position:relative; height:10px; border-radius:5px; overflow:hidden;}
.sk-aurora .thbar{background:#101A2C;}
.sk-daylight .thbar{background:#F4F2EC;}
.thband{position:absolute; top:0; bottom:0;}
.thband.warn{background:rgba(255,180,84,.14);}
.thband.crit{background:rgba(255,107,94,.18);}
.sk-daylight .thband.warn{background:rgba(176,119,26,.12);}
.sk-daylight .thband.crit{background:rgba(185,28,28,.12);}
.thfill{position:absolute; top:0; bottom:0; left:0; border-radius:5px; transition:width .6s cubic-bezier(.4,0,.2,1);}
.sk-aurora .thfill.z-ok{background:#4ADE80;}
.sk-daylight .thfill.z-ok{background:#0E9382;}
.thfill.z-warn{background:#FFB454;}
.sk-daylight .thfill.z-warn{background:#B0771A;}
.thfill.z-crit{background:#FF6B5E; box-shadow:0 0 8px rgba(255,107,94,.7);}
.sk-daylight .thfill.z-crit{background:#B91C1C; box-shadow:none;}
.thtick{position:absolute; top:0; bottom:0; width:2px;}
.thtick.warn{background:#FFB454;}
.thtick.crit{background:#FF6B5E;}
.sk-daylight .thtick.warn{background:#B0771A;}
.sk-daylight .thtick.crit{background:#B91C1C;}
.thscale{position:relative; height:13px; margin-top:3px; font:600 8.5px 'IBM Plex Mono',monospace;}
.thscale span{position:absolute; top:1px;}
.thscale .lo{left:0;}
.thscale .hi{right:0;}
.thscale .warn, .thscale .crit{transform:translateX(-50%);}
.sk-aurora .thscale{color:#55627A;}
.sk-daylight .thscale{color:#9A958A;}
.sk-aurora .thscale .warn{color:#FFB454;}
.sk-aurora .thscale .crit{color:#FF6B5E;}
.sk-daylight .thscale .warn{color:#B0771A;}
.sk-daylight .thscale .crit{color:#B91C1C;}
.thspark{display:block; width:100%; height:auto; margin-top:6px;}
.thguide{stroke-width:1; stroke-dasharray:3 4;}
.thguide.warn{stroke:rgba(255,180,84,.45);}
.thguide.crit{stroke:rgba(255,107,94,.45);}
.sk-daylight .thguide.warn{stroke:rgba(176,119,26,.45);}
.sk-daylight .thguide.crit{stroke:rgba(185,28,28,.45);}
.thline{fill:none; stroke-width:1.6; stroke-linejoin:round; stroke-linecap:round;}
.sk-aurora .thline{stroke:#38E1FF;}
.sk-daylight .thline{stroke:#4956C9;}
.thline.ghost{opacity:.18;}
.thdot{opacity:.25;}
.thdot.on{opacity:1;}
.sk-aurora .thdot.z-ok{fill:#4ADE80;}
.sk-daylight .thdot.z-ok{fill:#0E9382;}
.thdot.z-warn{fill:#FFB454;}
.sk-daylight .thdot.z-warn{fill:#B0771A;}
.thdot.z-crit{fill:#FF6B5E;}
.sk-daylight .thdot.z-crit{fill:#B91C1C;}
.sk-aurora .thdot.cur{filter:drop-shadow(0 0 4px rgba(56,225,255,.8));}
.thdot.cur.z-crit{filter:drop-shadow(0 0 5px rgba(255,107,94,.9)); animation:ledpulse .6s ease-in-out infinite alternate;}`,
    },
    {
      order: 1212,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .thfill{transition:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .thzone.z-crit, .thdot.cur.z-crit{animation:none !important;}
}`,
    },
    {
      order: 1624,
      css: String.raw`@media screen {
  body.sk-terminal .thband.warn,
  body.sk-terminal .thband.crit{background:rgba(255,107,94,.10);}
}`,
    },
    {
      order: 1628,
      css: String.raw`@media screen {
  body.sk-terminal .sk-aurora .thscale{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .thscale .warn,
  body.sk-terminal .sk-aurora .thscale .crit{color:var(--tm-alert);}
}`,
    },
    {
      order: 1845,
      css: String.raw`@media screen {
  body.sk-pastel .thband.warn { background:rgba(209,154,77,.15); }
}
@media screen {
  body.sk-pastel .thband.crit { background:rgba(211,99,112,.15); }
}`,
    },
    {
      order: 2082,
      css: String.raw`@media screen {
  body.sk-blueprint .thbar{height:8px;}
}
@media screen {
  body.sk-blueprint .thfill{border-radius:0;}
}`,
    },
    {
      order: 2420,
      css: String.raw`.thermal-halo{fill:currentColor;opacity:.13;transform-box:fill-box;transform-origin:center;animation:thermalbreathe 3s ease-in-out infinite;}
.thermal-hot .thermal-halo,.thermal-freezing .thermal-halo{opacity:.23;animation-duration:1.8s;}
.thermal-rim{fill:none;stroke:currentColor;stroke-width:1.2;opacity:.65;}
.thermal-wave{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;animation:thermalrise 2.4s ease-in-out infinite;}
.thermal-frost{fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;}
.thermal-freezing .thermal-frost{stroke-width:1.8;}
.thermal-badge circle{fill:var(--hm-surface);stroke:currentColor;stroke-width:1;}
.thermal-badge path,.thermal-badge use{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;}
.thermal-clearing{animation:thermalclear 1.2s ease-out forwards;}`,
    },
    {
      order: 2435,
      css: String.raw`body .docview .thval.z-cold-warn,body .docview .thscale .cold-warn{color:var(--th-cold) !important;}
body .docview .thval.z-cold-crit,body .docview .thscale .cold-crit{color:var(--th-freezing) !important;}
body .docview .thzone.z-cold-warn{color:var(--th-cold);border-color:var(--th-cold);background:color-mix(in srgb,var(--th-cold) 12%,transparent);}
body .docview .thzone.z-cold-crit{color:var(--th-freezing);border-color:var(--th-freezing);background:color-mix(in srgb,var(--th-freezing) 12%,transparent);}
.thfill.z-cold-warn,.thtick.cold-warn{background:#39B7DD;}
.thfill.z-cold-crit,.thtick.cold-crit{background:#668AF0;}
.thband.cold-warn{background:rgba(57,183,221,.22);}
.thband.cold-crit{background:rgba(102,138,240,.3);}
.thband.safe{background:rgba(65,174,111,.12);}
.thscale .cold-warn,.thscale .cold-crit{transform:translateX(-50%);}
.thguide.cold-warn{stroke:#39B7DD;opacity:.55;}
.thguide.cold-crit{stroke:#668AF0;opacity:.55;}
.thdot.z-cold-warn{fill:#39B7DD;}
.thdot.z-cold-crit{fill:#668AF0;}
.thrange-key{display:flex;justify-content:space-between;gap:8px;font:500 9px 'IBM Plex Mono',monospace;opacity:.8;margin-top:5px;}`,
    },
    {
      order: 2456,
      css: String.raw`@media(prefers-reduced-motion:reduce){
  .thermal-clearing{display:none;}
}`,
    },
    {
      order: 2458,
      css: String.raw`@media print{
  .thermal-clearing{display:none;}
}`,
    },
  ],
});

/* thermo authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('thermo', {
  authoring: {
    template: {
      title: 'Temperature',
      min: 0,
      max: 100,
      warn: 60,
      crit: 85,
      initial: { value: 21 },
    },
    setupFields: [
      ['unit', 'text'],
      ['min', 'num'],
      ['max', 'num'],
      ['warn', 'num'],
      ['crit', 'num'],
      ['lowWarn', 'num'],
      ['lowCrit', 'num'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['value', 'num'],
      ['label', 'text'],
    ],
    picker: {
      order: 19,
      name: 'Temperature',
      category: 'Devices & interfaces',
      tagline: 'Temperature over time',
      description: 'Display temperature, warning bands, and its history across the story’s steps.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.value = 42;
      states = [21, 24, 26, 25, 31, 38, 42].map(function (value) {
        return { value: value };
      });
      step = 6;

      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
