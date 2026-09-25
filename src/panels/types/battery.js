/* battery validation and pure state helpers. */

PanelRegistry.extend('battery', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    ['low', 'crit'].forEach(function (bk) {
      if (p[bk] != null && !isFiniteNum(p[bk]))
        warnings.push(PP + '.' + bk + ': must be a finite number — ignored');
    });
    if (isFiniteNum(p.low) && isFiniteNum(p.crit) && p.crit > p.low)
      warnings.push(
        PP + ': crit exceeds low — thresholds swapped at render (battery zones are at-or-below)'
      );
    if (p.initial && p.initial.charge != null && !isFiniteNum(p.initial.charge))
      warnings.push(PP + '.initial.charge: must be a finite number — rendered as NO DATA');
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    if (patch.charge != null && !isFiniteNum(patch.charge))
      warnings.push(path + '.charge: must be a finite number — rendered as NO DATA');
  },
});

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
    label: state.label != null ? String(state.label) : BATTERY_ZONE_LABELS[zone],
  };
}

/* tiles widget: a device-fleet grid — one named tile per device/cohort with
   a state chip and an optional sub-line. Pure model (node-testable). Tiles
   and the state vocabulary (states + colors, like the state widget) are
   DECLARED once; each step patches per tile id (like leds/signal): a patch
   replaces that tile's whole `{state, sub}` status. A state not in the
   declared list renders the tile dimmed with '—' (validator warns). */

PanelViews.register('battery', function (host, panel, state, skin, states, stepIdx, animate) {
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
    FlowIcons.render(bm.trend === 'charging' ? 'battery-charging' : bm.zone === 'low' || bm.zone === 'crit' ? 'battery-low' : 'battery',
      {className:'btstatus',tone:{ok:'ok',low:'warn',crit:'alert',na:'muted'}[bm.zone],label:bm.trend === 'charging' ? 'Charging' : undefined}) +
    (bm.cold ? FlowIcons.render('snowflake',{className:'btcold',label:'Cold-limited'}) : '') +
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
      '<span class="btfill z-' + bm.zone + '" style="width:' + bm.charge.toFixed(1) + '%"></span>';
  if (bm.low != null)
    h += '<span class="bttick low" style="left:' + bm.low.toFixed(1) + '%"></span>';
  if (bm.crit != null)
    h += '<span class="bttick crit" style="left:' + bm.crit.toFixed(1) + '%"></span>';
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
    h += '<svg class="btspark" viewBox="0 0 260 62" role="img" aria-label="charge per step">';
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
      if (seg.length > 1) h += '<polyline class="btline ghost" points="' + seg.join(' ') + '"/>';
    });
    bLit.forEach(function (seg) {
      if (seg.length > 1) h += '<polyline class="btline" points="' + seg.join(' ') + '"/>';
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
});

PanelRegistry.extend('battery', {
  order: 13,
  label: 'Battery',
  since: '0.1.0',
});

PanelRegistry.extend('battery', {
  styles: [
    {
      order: 758,
      css: String.raw`.bthead{display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:8px;}
.btval{font:700 20px 'IBM Plex Mono',monospace;}
.btunit{font-size:11px; font-weight:500; opacity:.6; margin-left:3px;}
.btstatus,.btcold{width:20px;height:20px;vertical-align:-3px;margin-left:5px;}
.btcold{width:17px;height:17px;margin-left:4px;}
.sk-aurora .btval{color:#EAF2FF;}
.sk-daylight .btval{color:#23272E;}
.sk-aurora .btval.z-low{color:#FFB454;}
.sk-daylight .btval.z-low{color:#B0771A;}
.sk-aurora .btval.z-crit{color:#FF6B5E;}
.sk-daylight .btval.z-crit{color:#B91C1C;}
.btval.z-na{opacity:.4;}
.btzone{font:700 9.5px 'IBM Plex Mono',monospace; letter-spacing:.08em; padding:3px 8px; border-radius:6px; border:1px solid transparent; white-space:nowrap;}
.sk-aurora .btzone.z-ok{color:#4ADE80; border-color:#1E4A33; background:#0C2418;}
.sk-daylight .btzone.z-ok{color:#0E7A3C; border-color:#BFE3CC; background:#EAF7EF;}
.sk-aurora .btzone.z-low{color:#FFB454; border-color:#5A431C; background:#2A2010;}
.sk-daylight .btzone.z-low{color:#B0771A; border-color:#EAD9B0; background:#FBF3E0;}
.sk-aurora .btzone.z-crit{color:#FF6B5E; border-color:#5F2320; background:#2C1210;}
.sk-daylight .btzone.z-crit{color:#B91C1C; border-color:#EFC4C0; background:#FBEBEA;}
.btzone.z-crit{animation:ledpulse .6s ease-in-out infinite alternate;}
.sk-aurora .btzone.z-na{color:#55627A; border-color:#1D2A40; background:#101A2C;}
.sk-daylight .btzone.z-na{color:#9A958A; border-color:#E0DCD1; background:#F4F2EC;}
.btglyph{display:flex; align-items:center; gap:2px;}
.btshell{position:relative; flex:1; height:14px; border-radius:4px; overflow:hidden; border:1.5px solid;}
.sk-aurora .btshell{background:#101A2C; border-color:#2B3B55;}
.sk-daylight .btshell{background:#F4F2EC; border-color:#C9C4B8;}
.btnub{width:4px; height:7px; border-radius:0 2px 2px 0;}
.sk-aurora .btnub{background:#2B3B55;}
.sk-daylight .btnub{background:#C9C4B8;}
.btfill{position:absolute; top:0; bottom:0; left:0; transition:width .6s cubic-bezier(.4,0,.2,1);}
.sk-aurora .btfill.z-ok{background:#4ADE80;}
.sk-daylight .btfill.z-ok{background:#0E9382;}
.btfill.z-low{background:#FFB454;}
.sk-daylight .btfill.z-low{background:#B0771A;}
.btfill.z-crit{background:#FF6B5E; box-shadow:0 0 8px rgba(255,107,94,.7);}
.sk-daylight .btfill.z-crit{background:#B91C1C; box-shadow:none;}
.bttick{position:absolute; top:0; bottom:0; width:2px;}
.bttick.low{background:#FFB454;}
.bttick.crit{background:#FF6B5E;}
.sk-daylight .bttick.low{background:#B0771A;}
.sk-daylight .bttick.crit{background:#B91C1C;}
.btctx{display:flex; align-items:baseline; gap:10px; margin-top:5px; height:15px; overflow:hidden;
  font:600 9.5px 'IBM Plex Mono',monospace; letter-spacing:.05em;}
.sk-aurora .btctx{color:#5E7396;}
.sk-daylight .btctx{color:#8A8474;}
.btsrc{min-width:44px;}
.sk-aurora .btsrc{color:#8AE8FF;}
.sk-daylight .btsrc{color:#4956C9;}
.btnote{margin-left:auto; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;}
.btspark{display:block; width:100%; height:auto; margin-top:6px;}
.btguide{stroke-width:1; stroke-dasharray:3 4;}
.btguide.low{stroke:rgba(255,180,84,.45);}
.btguide.crit{stroke:rgba(255,107,94,.45);}
.sk-daylight .btguide.low{stroke:rgba(176,119,26,.45);}
.sk-daylight .btguide.crit{stroke:rgba(185,28,28,.45);}
.btline{fill:none; stroke-width:1.6; stroke-linejoin:round; stroke-linecap:round;}
.sk-aurora .btline{stroke:#38E1FF;}
.sk-daylight .btline{stroke:#4956C9;}
.btline.ghost{opacity:.18;}
.btdot{opacity:.25;}
.btdot.on{opacity:1;}
.sk-aurora .btdot.z-ok{fill:#4ADE80;}
.sk-daylight .btdot.z-ok{fill:#0E9382;}
.btdot.z-low{fill:#FFB454;}
.sk-daylight .btdot.z-low{fill:#B0771A;}
.btdot.z-crit{fill:#FF6B5E;}
.sk-daylight .btdot.z-crit{fill:#B91C1C;}
.sk-aurora .btdot.cur{filter:drop-shadow(0 0 4px rgba(56,225,255,.8));}
.btdot.cur.z-crit{filter:drop-shadow(0 0 5px rgba(255,107,94,.9)); animation:ledpulse .6s ease-in-out infinite alternate;}`,
    },
    {
      order: 1214,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .btfill{transition:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .btzone.z-crit, .btdot.cur.z-crit{animation:none !important;}
}`,
    },
    {
      order: 1419,
      css: String.raw`body.sk-editorial .sk-aurora .btshell,
body.sk-editorial .sk-daylight .btshell{
  border-color:var(--ed-rule-strong);
  border-radius:2px;
  background:var(--ed-paper);
}
body.sk-editorial .sk-aurora .btnub,
body.sk-editorial .sk-daylight .btnub{background:var(--ed-rule-strong);}`,
    },
    {
      order: 1635,
      css: String.raw`@media screen {

  body.sk-terminal .btshell,
  body.sk-terminal .sk-aurora .btshell{
    height:14px;
    background:var(--tm-raised);
    border:1px solid var(--tm-line);
    border-radius:0;
  }
}
@media screen {
  body.sk-terminal .btnub,
  body.sk-terminal .sk-aurora .btnub{background:var(--tm-line); border-radius:0;}
}
@media screen {
  body.sk-terminal .btctx,
  body.sk-terminal .sk-aurora .btctx{color:var(--tm-muted); text-transform:uppercase;}
}
@media screen {
  body.sk-terminal .sk-aurora .btsrc{color:var(--tm-good);}
}`,
    },
    {
      order: 1855,
      css: String.raw`@media screen {
  body.sk-pastel .btshell,
  body.sk-pastel .sk-aurora .btshell,
  body.sk-pastel .sk-daylight .btshell { background:#EDF1F6; border-color:#CCD5E2; border-radius:6px; }
}
@media screen {
  body.sk-pastel .btnub,
  body.sk-pastel .sk-aurora .btnub,
  body.sk-pastel .sk-daylight .btnub { background:#B7C1CF; }
}
@media screen {
  body.sk-pastel .sk-aurora .btsrc,
  body.sk-pastel .sk-daylight .btsrc { color:#5263B9; }
}`,
    },
    {
      order: 2089,
      css: String.raw`@media screen {
  body.sk-blueprint .docview .btshell{height:12px;border-radius:0;background:#031F43;border-color:#4D94AE;}
}
@media screen {
  body.sk-blueprint .docview .btnub{border-radius:0;background:#4D94AE;}
}
@media screen {
  body.sk-blueprint .docview .btsrc{color:#A7EDFA;}
}`,
    },
  ],
});

/* battery authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('battery', {
  authoring: {
    template: { title: 'Battery', low: 30, crit: 10, initial: { charge: 80 } },
    setupFields: [
      ['low', 'num'],
      ['crit', 'num'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['charge', 'num'],
      ['trend', 'enum', ['charging', 'draining', 'idle']],
      ['source', 'enum', ['solar', 'wired', 'poe', 'cells']],
      ['cold', 'bool'],
      ['note', 'text'],
      ['label', 'text'],
    ],
    picker: {
      order: 20,
      name: 'Battery',
      category: 'Devices & interfaces',
      tagline: 'Charge and power context',
      description:
        'Track charge level, charging source, thresholds, and a history of battery levels.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { charge: 76, source: 'solar', trend: 'charging' };
      states = [48, 47, 49, 56, 64, 72, 76].map(function (charge) {
        return { charge: charge };
      });
      step = 6;

      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
