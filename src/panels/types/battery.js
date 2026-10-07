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
    if (panelObject(p.initial) && panelOwn(p.initial, 'drain'))
      warnings.push(PP + '.initial.drain: drain is a step operation — ignored; set initial.charge instead');
    Object.keys(STORY_BATTERY_DEFAULTS).forEach(function (key) {
      if (p[key] != null && storyTimeRate(p[key]) == null)
        warnings.push(PP + '.' + key + ': expected a number ≥ 0 (percent per hour) — using the diagram default or built-in placeholder');
    });
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    if (patch.charge != null && !isFiniteNum(patch.charge))
      warnings.push(path + '.charge: must be a finite number — rendered as NO DATA');
    if (panelOwn(patch, 'drain')) {
      if (!isFiniteNum(patch.drain) || patch.drain < 0)
        warnings.push(path + '.drain: expected additional drain as a number ≥ 0 (percent) — ignored');
      else if (panelOwn(patch, 'charge'))
        warnings.push(path + '.drain: ignored because charge sets the value at this step');
    }
  },
  fold: function (panel, steps) {
    /* drain is a one-step operation, never carried state. */
    return foldCommonPanelStates(panel, steps).map(function (state) {
      delete state.drain;
      return state;
    });
  },
  storyTime: batteryStoryStates,
});

/* Automatic charge from story time (docs/step-time.md). The interval before a
   step uses the trend in effect before it; an authored charge anchors the
   value exactly; `drain` subtracts extra percent at its step. Without story
   time and without drain operations, the folded states are unchanged. */
function batteryStoryStates(panel, states, steps, story, d) {
  var patches = steps.map(function (st) {
    var patch = (stepPanelPatch(st) || {})[panel.id];
    return panelObject(patch) ? patch : {};
  });
  if (!story && !patches.some(function (patch) { return panelOwn(patch, 'drain'); })) return states;
  var rates = storyBatteryConstants(panel, d),
    initial = panelObject(panel.initial) ? panel.initial : {};
  var charge = isFiniteNum(initial.charge) ? clamp(initial.charge, 0, 100) : null,
    trend = initial.trend,
    derived = false;
  states.forEach(function (state, i) {
    if (i >= steps.length) return;
    var patch = patches[i], once = panelObject(patch.enterOnce) ? patch.enterOnce : null;
    if (story && charge != null) {
      var at = storyTimeAt(story, i), hours = Math.max(0, at.time - at.previous) / 3600000;
      if (hours > 0) {
        charge = clamp(charge + hours * (trend === 'charging' ? rates.chargePerHour : -rates.drainPerHour), 0, 100);
        derived = true;
      }
    }
    if (panelOwn(patch, 'charge')) {
      charge = isFiniteNum(patch.charge) ? clamp(patch.charge, 0, 100) : null;
      derived = false;
    } else if (charge != null && isFiniteNum(patch.drain) && patch.drain >= 0) {
      charge = clamp(charge - patch.drain, 0, 100);
      derived = true;
    }
    if (panelOwn(patch, 'trend')) trend = patch.trend;
    if (derived && !(once && panelOwn(once, 'charge'))) {
      state.charge = Math.round(charge * 100) / 100;
      storyTimeMark(state, 'charge', 'battery');
    }
  });
  return states;
}

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
    initialFields: true,
    fieldMeta: {
      low: { label: 'Low threshold' },
      crit: { label: 'Critical threshold' },
      drainPerHour: { label: 'Drain % per hour' },
      chargePerHour: { label: 'Charge % per hour' },
      charge: { label: 'Charge %', group: 'Reading' },
      drain: { label: 'Extra drain %', group: 'Reading', initial: { hidden: true } },
      trend: { label: 'Trend', group: 'Power' },
      source: { label: 'Power source', group: 'Power' },
      cold: { label: 'Cold conditions', group: 'Context' },
      note: { label: 'Note', group: 'Context' },
      label: { label: 'Reading label', group: 'Context' },
    },
    /* New panels start with the diagram's authored constants. Built-in
       placeholders are not copied, so the inspector keeps showing them as
       placeholders instead of passing them off as this device's rates. */
    instantiate: function (panel, diagram) {
      var rates = storyBatteryConstants({}, diagram), sources = storyBatteryConstantSources({}, diagram);
      Object.keys(rates).forEach(function (key) {
        if (sources[key] === 'diagram') panel[key] = rates[key];
      });
      return panel;
    },
    setupFields: [
      ['low', 'num'],
      ['crit', 'num'],
      ['drainPerHour', 'num'],
      ['chargePerHour', 'num'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['charge', 'num'],
      ['drain', 'num'],
      ['trend', 'enum', ['charging', 'draining', 'idle']],
      ['source', 'enum', ['solar', 'wired', 'poe', 'cells']],
      ['cold', 'bool'],
      ['note', 'text'],
      ['label', 'text'],
    ],
    editor: function (context) {
      var labels = { drainPerHour: 'Drain % per hour', chargePerHour: 'Charge % per hour' },
        short = { drainPerHour: 'Drain %/h', chargePerHour: 'Charge %/h' };
      /* Say whether the fallback is the diagram's rate or the built-in
         placeholder, which is not a device fact. */
      function inherited(key) {
        var parsed = context.parse(), d = null;
        if (!parsed.error) {
          var rec = specSectionPaths(parsed.raw)[context.target().section];
          d = rec ? specValueAt(parsed.raw, rec.diagram) : null;
        }
        var value = storyBatteryConstants({}, d)[key];
        return storyBatteryConstantSources({}, d)[key] === 'diagram'
          ? 'Diagram default · ' + value + ' %/h'
          : 'Built-in default · ' + value + ' %/h (placeholder)';
      }
      return {
        patchLabel: function (key) {
          return key === 'drain' ? 'Extra drain %' : key;
        },
        setupField: function (field, panel) {
          var key = field[0];
          if (!labels[key]) return;
          var input = context.controls.number(panel[key], function (value) {
            if (value != null && value < 0) {
              context.error(labels[key] + ' must be 0 or more.');
              return false;
            }
            return context.commit(key, value == null ? null : String(value));
          });
          input.classList.remove('fnum');
          input.placeholder = inherited(key);
          input.setAttribute('aria-label', labels[key]);
          return context.controls.row(short[key], input);
        },
        patchField: function (field, input) {
          if (field[0] === 'drain') input.placeholder = 'Extra % used at this step';
        },
      };
    },
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

PanelRegistry.extend('battery', {layout: {sectionSizing: { minWidth: 155, preferredWidth: 195, maxWidth: 420, aspectPolicy: 'content', grow: 1 }}});
