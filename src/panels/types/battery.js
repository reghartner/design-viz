/* battery panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var BATTERY_ZONE_LABELS = {
  ok: 'NOMINAL',
  low: 'LOW',
  crit: 'CRITICAL',
  na: 'NO DATA',
};
var BATTERY_SOURCES = ['solar', 'wired', 'poe', 'cells'];
var BATTERY_TRENDS = ['charging', 'draining', 'idle'];
function batteryModel(panel, state) {
  panel = panel || {};
  state = state || {};
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  var low = fin(panel.low) != null ? clamp(panel.low, 0, 100) : null;
  var crit = fin(panel.crit) != null ? clamp(panel.crit, 0, 100) : null;
  if (low != null && crit != null && crit > low) {
    var sw = low;
    low = crit;
    crit = sw;
  }
  var charge = fin(state.charge) != null ? clamp(state.charge, 0, 100) : null;
  var zone = 'na';
  if (charge != null) {
    zone = 'ok';
    if (low != null && charge <= low) zone = 'low';
    if (crit != null && charge <= crit) zone = 'crit';
  }
  var trend = BATTERY_TRENDS.indexOf(state.trend) >= 0 ? state.trend : null;
  var source = BATTERY_SOURCES.indexOf(state.source) >= 0 ? state.source : null;
  return {
    charge: charge,
    low: low,
    crit: crit,
    zone: zone,
    trend: trend,
    source: source,
    cold: state.cold === true,
    note: state.note != null ? String(state.note) : '',
    label:
      state.label != null ? String(state.label) : BATTERY_ZONE_LABELS[zone],
  };
}

/* tiles widget: a device-fleet grid — one named tile per device/cohort with
   a state chip and an optional sub-line. Pure model (node-testable). Tiles
   and the state vocabulary (states + colors, like the state widget) are
   DECLARED once; each step patches per tile id (like leds/signal): a patch
   replaces that tile's whole `{state, sub}` status. A state not in the
   declared list renders the tile dimmed with '—' (validator warns). */

PanelViews.register(
  'battery',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var bm = batteryModel(panel, state);
    var bidx = typeof stepIdx === 'number' ? stepIdx : 0;
    var bv = bm.charge != null ? String(Math.round(bm.charge)) : null;
    h +=
      '<div class="bthead"><div class="btval z-' +
      bm.zone +
      '">' +
      (bv != null ? esc(bv) : '&#8212;') +
      '<span class="btunit">%</span>' +
      (bm.trend === 'charging'
        ? '<span class="btbolt" aria-label="charging">&#9889;</span>'
        : '') +
      (bm.cold
        ? '<span class="btcold" aria-label="cold-limited">&#10052;</span>'
        : '') +
      '</div><span class="btzone z-' +
      bm.zone +
      '">' +
      esc(bm.label) +
      '</span></div>';
    /* battery glyph: shell + terminal nub + zone-colored fill; low/crit
       threshold ticks on the shell like thermo's bands */
    h += '<div class="btglyph"><div class="btshell">';
    if (bm.charge != null)
      h +=
        '<span class="btfill z-' +
        bm.zone +
        '" style="width:' +
        bm.charge.toFixed(1) +
        '%"></span>';
    if (bm.low != null)
      h +=
        '<span class="bttick low" style="left:' +
        bm.low.toFixed(1) +
        '%"></span>';
    if (bm.crit != null)
      h +=
        '<span class="bttick crit" style="left:' +
        bm.crit.toFixed(1) +
        '%"></span>';
    h += '</div><span class="btnub"></span></div>';
    /* context row: power source badge + trend word + forecast note; all
       containers always emitted so the panel height is constant */
    h +=
      '<div class="btctx"><span class="btsrc">' +
      (bm.source ? esc(bm.source.toUpperCase()) : '') +
      '</span>' +
      '<span class="bttrend">' +
      (bm.trend ? esc(bm.trend) : '') +
      '</span>' +
      '<span class="btnote">' +
      esc(bm.note) +
      '</span></div>';
    /* step-history sparkline, same reveal semantics as thermo: every step's
       folded charge plots faintly, bright up to the current step, gaps break
       the line */
    var bhist = Array.isArray(states)
      ? states.map(function (s) {
          return s && typeof s.charge === 'number' && isFinite(s.charge)
            ? clamp(s.charge, 0, 100)
            : null;
        })
      : [];
    if (bhist.length > 1) {
      var bX = function (i) {
        return 6 + (248 * i) / (bhist.length - 1);
      };
      var bY = function (vv) {
        return 54 - (vv / 100) * 46;
      };
      h +=
        '<svg class="btspark" viewBox="0 0 260 62" role="img" aria-label="charge per step">';
      if (bm.low != null)
        h +=
          '<line class="btguide low" x1="6" x2="254" y1="' +
          bY(bm.low).toFixed(1) +
          '" y2="' +
          bY(bm.low).toFixed(1) +
          '"/>';
      if (bm.crit != null)
        h +=
          '<line class="btguide crit" x1="6" x2="254" y1="' +
          bY(bm.crit).toFixed(1) +
          '" y2="' +
          bY(bm.crit).toFixed(1) +
          '"/>';
      var bGhost = [],
        bLit = [],
        bg = null,
        bl = null;
      bhist.forEach(function (vv, i) {
        if (vv == null) {
          bg = null;
          bl = null;
          return;
        }
        var pt = bX(i).toFixed(1) + ',' + bY(vv).toFixed(1);
        if (!bg) {
          bg = [];
          bGhost.push(bg);
        }
        bg.push(pt);
        if (i <= bidx) {
          if (!bl) {
            bl = [];
            bLit.push(bl);
          }
          bl.push(pt);
        } else bl = null;
      });
      bGhost.forEach(function (seg) {
        if (seg.length > 1)
          h +=
            '<polyline class="btline ghost" points="' + seg.join(' ') + '"/>';
      });
      bLit.forEach(function (seg) {
        if (seg.length > 1)
          h += '<polyline class="btline" points="' + seg.join(' ') + '"/>';
      });
      bhist.forEach(function (vv, i) {
        if (vv == null) return;
        var bz = batteryModel(panel, { charge: vv }).zone;
        var bCur = i === bidx;
        h +=
          '<circle class="btdot z-' +
          bz +
          (i <= bidx ? ' on' : '') +
          (bCur ? ' cur' : '') +
          '" cx="' +
          bX(i).toFixed(1) +
          '" cy="' +
          bY(vv).toFixed(1) +
          '" r="' +
          (bCur ? 4 : 2.4) +
          '"/>';
      });
      h += '</svg>';
    }
    return {
      html: h,
      level: {
        pct: bm.charge != null ? bm.charge : 0,
        value: bm.charge,
        settled: bv,
        fill: '.btfill',
        readout: '.btval',
        decimals: 0,
      },
    };
  }
);
