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

PanelViews.register(
  'thermo',
  function (host, panel, state, skin, states, stepIdx, animate) {
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
      var safeEnd =
        tm.warnPct != null ? tm.warnPct : tm.critPct != null ? tm.critPct : 100;
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
      h +=
        '<span class="thfill z-' +
        tm.zone +
        '" style="width:' +
        tm.pct.toFixed(1) +
        '%"></span>';
    if (tm.warnPct != null)
      h +=
        '<span class="thtick warn" style="left:' +
        tm.warnPct.toFixed(1) +
        '%"></span>';
    if (tm.critPct != null)
      h +=
        '<span class="thtick crit" style="left:' +
        tm.critPct.toFixed(1) +
        '%"></span>';
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
    h +=
      '<div class="thscale"><span class="lo">' +
      esc(String(tm.min)) +
      '</span>';
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
          return s && typeof s.value === 'number' && isFinite(s.value)
            ? s.value
            : null;
        })
      : [];
    if (hist.length > 1) {
      var sX = function (i) {
        return 6 + (248 * i) / (hist.length - 1);
      };
      var sY = function (vv) {
        return 54 - clamp((vv - tm.min) / (tm.max - tm.min), 0, 1) * 46;
      };
      h +=
        '<svg class="thspark" viewBox="0 0 260 62" role="img" aria-label="temperature per step">';
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
        if (seg.length > 1)
          h +=
            '<polyline class="thline ghost" points="' + seg.join(' ') + '"/>';
      });
      litSegs.forEach(function (seg) {
        if (seg.length > 1)
          h += '<polyline class="thline" points="' + seg.join(' ') + '"/>';
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
  }
);
