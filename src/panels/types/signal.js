/* signal validation and pure state helpers. */
var SIGNAL_STATES_V = ['ok', 'weak', 'retrying', 'lost', 'jammed'];
var SIGNAL_TRANSPORTS_V = [
  'wifi',
  'subghz',
  'thread',
  'zigbee',
  'zwave',
  'cellular',
  'poe',
  'ethernet',
  'ble',
];
function signalLinkWarnings(obj, path, warnings) {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    if (!v || typeof v !== 'object') return;
    if (v.state != null && SIGNAL_STATES_V.indexOf(v.state) < 0)
      warnings.push(
        path +
          '.' +
          k +
          '.state: unknown link state "' +
          v.state +
          '" — using "ok" (valid: ' +
          SIGNAL_STATES_V.join(' ') +
          ')'
      );
    if (
      v.bars != null &&
      !(typeof v.bars === 'number' && isFinite(v.bars) && v.bars >= 0 && v.bars <= 4)
    )
      warnings.push(path + '.' + k + '.bars: expected 0–4 — bars hidden');
    Object.keys(v).forEach(function (f) {
      if (['state', 'bars', 'note'].indexOf(f) < 0)
        warnings.push(
          path +
            '.' +
            k +
            '.' +
            f +
            ': not a signal field — ignored (valid: state, bars, note; put dBm figures in note)'
        );
    });
  });
}

/* tiles per-tile status checks shared by initial and step patches: each key
   is a tile id whose value is {state, sub}; a state outside the declared
   vocabulary renders the tile dimmed */

PanelRegistry.extend('signal', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.links) && p.links.length))
      warnings.push(
        PP + '.links: signal needs links:[{id, label, transport}] — panel renders empty'
      );
    else {
      if (p.links.length > 6)
        warnings.push(PP + '.links: more than 6 links — extra links are not rendered');
      p.links.forEach(function (l, li) {
        if (!l || !l.id) warnings.push(PP + '.links[' + li + ']: needs an id — link skipped');
        else if (l.transport != null && SIGNAL_TRANSPORTS_V.indexOf(l.transport) < 0)
          warnings.push(
            PP +
              '.links[' +
              li +
              '].transport: unknown transport "' +
              l.transport +
              '" — tag hidden (valid: ' +
              SIGNAL_TRANSPORTS_V.join(' ') +
              ')'
          );
      });
    }
    signalLinkWarnings(p.initial, PP + '.initial', warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    signalLinkWarnings(patch, path, warnings);
  },
});

/* signal panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var SIGNAL_STATES = ['ok', 'weak', 'retrying', 'lost', 'jammed'];
var SIGNAL_TRANSPORTS = [
  'wifi',
  'subghz',
  'thread',
  'zigbee',
  'zwave',
  'cellular',
  'poe',
  'ethernet',
  'ble',
];
function signalModel(panel, state) {
  panel = panel || {};
  state = state || {};
  function fin(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  return (Array.isArray(panel.links) ? panel.links : [])
    .slice(0, 6)
    .map(function (l) {
      l = l || {};
      var st = l.id && state[l.id] && typeof state[l.id] === 'object' ? state[l.id] : {};
      var s = SIGNAL_STATES.indexOf(st.state) >= 0 ? st.state : 'ok';
      var bars = fin(st.bars) != null ? Math.round(clamp(st.bars, 0, 4)) : null;
      return {
        id: l.id,
        label: l.label || l.id || '',
        transport: SIGNAL_TRANSPORTS.indexOf(l.transport) >= 0 ? l.transport : null,
        state: s,
        bars: bars,
        note: st.note != null ? String(st.note) : '',
      };
    })
    .filter(function (l) {
      return l.id;
    });
}

PanelViews.register('signal', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var sgm = signalModel(panel, state);
  h += '<div class="sgrows">';
  sgm.forEach(function (l) {
    h += '<div class="sgrow s-' + l.state + '">';
    h += '<span class="sgtag">' + (l.transport ? esc(l.transport.toUpperCase()) : '') + '</span>';
    h += '<span class="sglabel">' + esc(l.label) + '</span>';
    h += '<span class="sgbars">';
    for (var sb = 1; sb <= 4; sb++)
      h +=
        '<span class="sgbar b' + sb + (l.bars != null && sb <= l.bars ? ' on' : '') + '"></span>';
    h += '</span>';
    h += '<span class="sgstate">' + l.state.toUpperCase() + '</span>';
    h += '<span class="sgnote">' + esc(l.note) + '</span>';
    h += '</div>';
  });
  h += '</div>';
  return { html: h };
});

PanelRegistry.extend('signal', {
  order: 17,
  label: 'Signal',
  since: '0.1.0',
});

PanelRegistry.extend('signal', {
  styles: [
    {
      order: 925,
      css: String.raw`.sgrows{display:flex; flex-direction:column; gap:7px;}
.sgrow{display:flex; align-items:center; gap:8px; font:600 10px 'IBM Plex Mono',monospace;}
.sgtag{min-width:52px; letter-spacing:.06em;}
.sk-aurora .sgtag{color:#5E7396;}
.sk-daylight .sgtag{color:#8A8474;}
.sglabel{min-width:70px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.sk-aurora .sglabel{color:#93A7C9;}
.sk-daylight .sglabel{color:#6B6F7A;}
.sgbars{display:flex; align-items:flex-end; gap:2px; height:12px;}
.sgbar{width:4px; border-radius:1px;}
.sgbar.b1{height:4px;}
.sgbar.b2{height:7px;}
.sgbar.b3{height:10px;}
.sgbar.b4{height:12px;}
.sk-aurora .sgbar{background:#22314A;}
.sk-daylight .sgbar{background:#E0DCD1;}
.sgrow.s-ok .sgbar.on{background:#4ADE80;}
.sgrow.s-weak .sgbar.on{background:#FFB454;}
.sgrow.s-retrying .sgbar.on{background:#A78BFA; animation:ledpulse .6s ease-in-out infinite alternate;}
.sgrow.s-lost .sgbar.on, .sgrow.s-jammed .sgbar.on{background:#FF6B5E;}
.sgstate{min-width:64px; letter-spacing:.07em; font-weight:700;}
.sgrow.s-ok .sgstate{color:#4ADE80;}
.sgrow.s-weak .sgstate{color:#FFB454;}
.sgrow.s-retrying .sgstate{color:#A78BFA;}
.sgrow.s-lost .sgstate{color:#FF6B5E;}
.sgrow.s-jammed .sgstate{color:#FF6B5E; animation:ledpulse .35s ease-in-out infinite alternate;}
.sk-daylight .sgrow.s-ok .sgstate{color:#0E7A3C;}
.sk-daylight .sgrow.s-weak .sgstate{color:#B0771A;}
.sk-daylight .sgrow.s-retrying .sgstate{color:#7C5CC4;}
.sk-daylight .sgrow.s-lost .sgstate, .sk-daylight .sgrow.s-jammed .sgstate{color:#B91C1C;}
.sgnote{margin-left:auto; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:45%;}
.sk-aurora .sgnote{color:#5E7396;}
.sk-daylight .sgnote{color:#8A8474;}`,
    },
    {
      order: 1221,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .sgrow.s-retrying .sgbar.on, .sgrow.s-jammed .sgstate{animation:none !important;}
}`,
    },
    {
      order: 1429,
      css: String.raw`body.sk-editorial .sk-aurora .sgbar,
body.sk-editorial .sk-daylight .sgbar{background:#D7CEC0;}`,
    },
    {
      order: 1433,
      css: String.raw`body.sk-editorial .sgrow.s-weak .sgbar.on{background:var(--ed-warn);}
body.sk-editorial .sgrow.s-retrying .sgbar.on{background:#76558B;}
body.sk-editorial .sgrow.s-lost .sgbar.on,
body.sk-editorial .sgrow.s-jammed .sgbar.on{background:var(--ed-bad);}
body.sk-editorial .sk-aurora .sgrow.s-ok .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-ok .sgstate{color:var(--ed-good);}
body.sk-editorial .sk-aurora .sgrow.s-weak .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-weak .sgstate{color:var(--ed-warn);}
body.sk-editorial .sk-aurora .sgrow.s-retrying .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-retrying .sgstate{color:#76558B;}
body.sk-editorial .sk-aurora .sgrow.s-lost .sgstate,
body.sk-editorial .sk-aurora .sgrow.s-jammed .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-lost .sgstate,
body.sk-editorial .sk-daylight .sgrow.s-jammed .sgstate{color:var(--ed-bad);}`,
    },
    {
      order: 1491,
      css: String.raw`@media (max-width:600px){
  body.sk-editorial .sgrow{gap:5px;}
}
@media (max-width:600px){
  body.sk-editorial .sgtag{min-width:45px;}
}
@media (max-width:600px){
  body.sk-editorial .sglabel{min-width:58px;}
}`,
    },
    {
      order: 1684,
      css: String.raw`@media screen {

  body.sk-terminal .sgrows{gap:0;}
}
@media screen {
  body.sk-terminal .sgrow{padding:6px 0; border-bottom:1px solid var(--tm-line-dim);}
}
@media screen {
  body.sk-terminal .sgtag,
  body.sk-terminal .sglabel,
  body.sk-terminal .sgnote,
  body.sk-terminal .sk-aurora .sgtag,
  body.sk-terminal .sk-aurora .sglabel,
  body.sk-terminal .sk-aurora .sgnote{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sgbar{border-radius:0; background:var(--tm-line) !important;}
}
@media screen {
  body.sk-terminal .sgrow.s-ok .sgbar.on{background:var(--tm-good) !important;}
}
@media screen {
  body.sk-terminal .sgrow.s-weak .sgbar.on,
  body.sk-terminal .sgrow.s-retrying .sgbar.on,
  body.sk-terminal .sgrow.s-lost .sgbar.on,
  body.sk-terminal .sgrow.s-jammed .sgbar.on{background:var(--tm-alert) !important;}
}
@media screen {
  body.sk-terminal .sgrow.s-ok .sgstate{color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sgrow.s-weak .sgstate,
  body.sk-terminal .sgrow.s-retrying .sgstate,
  body.sk-terminal .sgrow.s-lost .sgstate,
  body.sk-terminal .sgrow.s-jammed .sgstate{color:var(--tm-alert);}
}`,
    },
    {
      order: 1899,
      css: String.raw`@media screen {

  body.sk-pastel .sgrow { gap:9px; }
}
@media screen {
  body.sk-pastel .sgtag,
  body.sk-pastel .sglabel,
  body.sk-pastel .sgnote,
  body.sk-pastel .sk-aurora .sgtag,
  body.sk-pastel .sk-daylight .sgtag,
  body.sk-pastel .sk-aurora .sglabel,
  body.sk-pastel .sk-daylight .sglabel,
  body.sk-pastel .sk-aurora .sgnote,
  body.sk-pastel .sk-daylight .sgnote { color:#667389; }
}
@media screen {
  body.sk-pastel .sgbar { width:5px; border-radius:999px; }
}
@media screen {
  body.sk-pastel .sk-aurora .sgbar,
  body.sk-pastel .sk-daylight .sgbar { background:#D9E0E9; }
}
@media screen {
  body.sk-pastel .sgrow.s-ok .sgbar.on { background:#5EAF83; }
}
@media screen {
  body.sk-pastel .sgrow.s-weak .sgbar.on { background:#D19A4D; }
}
@media screen {
  body.sk-pastel .sgrow.s-retrying .sgbar.on { background:#8A7AD3; }
}
@media screen {
  body.sk-pastel .sgrow.s-lost .sgbar.on,
  body.sk-pastel .sgrow.s-jammed .sgbar.on { background:#D36370; }
}
@media screen {
  body.sk-pastel .sgrow.s-ok .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-ok .sgstate { color:#287A55; }
}
@media screen {
  body.sk-pastel .sgrow.s-weak .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-weak .sgstate { color:#9A641E; }
}
@media screen {
  body.sk-pastel .sgrow.s-retrying .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-retrying .sgstate { color:#6759B3; }
}
@media screen {
  body.sk-pastel .sgrow.s-lost .sgstate,
  body.sk-pastel .sgrow.s-jammed .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-lost .sgstate,
  body.sk-pastel .sk-daylight .sgrow.s-jammed .sgstate { color:#AE4654; }
}`,
    },
    {
      order: 2141,
      css: String.raw`@media screen {

  body.sk-blueprint .sgrows{gap:5px;}
}
@media screen {
  body.sk-blueprint .sgrow{gap:6px;font-size:9.5px;}
}
@media screen {
  body.sk-blueprint .docview .sgtag{color:#9BC2D5;}
}
@media screen {
  body.sk-blueprint .docview .sglabel{color:#D1E6F0;}
}
@media screen {
  body.sk-blueprint .docview .sgbar{background:#255D7D;}
}
@media screen {
  body.sk-blueprint .sgrow.s-ok .sgbar.on{background:#47F590;}
}
@media screen {
  body.sk-blueprint .sgrow.s-weak .sgbar.on{background:#FFD166;}
}
@media screen {
  body.sk-blueprint .sgrow.s-retrying .sgbar.on{background:#C3A4FF;}
}
@media screen {
  body.sk-blueprint .sgrow.s-lost .sgbar.on,body.sk-blueprint .sgrow.s-jammed .sgbar.on{background:#FF5C67;}
}
@media screen {
  body.sk-blueprint .sgrow.s-ok .sgstate{color:#47F590;}
}
@media screen {
  body.sk-blueprint .sgrow.s-weak .sgstate{color:#FFD166;}
}
@media screen {
  body.sk-blueprint .sgrow.s-retrying .sgstate{color:#C3A4FF;}
}
@media screen {
  body.sk-blueprint .sgrow.s-lost .sgstate,body.sk-blueprint .sgrow.s-jammed .sgstate{color:#FF7881;}
}
@media screen {
  body.sk-blueprint .docview .sgnote{color:#99BED1;}
}`,
    },
  ],
});

/* signal authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('signal', {
  authoring: {
    template: { title: 'Links', links: [{ id: 'up', label: 'uplink', transport: 'wifi' }] },
    setupFields: [
      [
        'links',
        'rows',
        {
          cols: [
            { k: 'id', req: true },
            { k: 'label' },
            {
              k: 'transport',
              kind: 'enum',
              options: [
                'wifi',
                'subghz',
                'thread',
                'zigbee',
                'zwave',
                'cellular',
                'poe',
                'ethernet',
                'ble',
              ],
            },
          ],
          max: 6,
        },
      ],
      ['initial', 'json'],
    ],
    patchFields: [],
    picker: {
      order: 22,
      name: 'Connection strength',
      category: 'Devices & interfaces',
      tagline: 'The health of a link',
      description:
        'Compare transport, connection status, signal strength, and notes for device links.',
    },
    expandPatchFields: function (decl) {
      return (Array.isArray(decl.links) ? decl.links : [])
        .filter(function (item) {
          return item && typeof item.id === 'string' && item.id !== '';
        })
        .map(function (item) {
          return [
            item.id,
            'objf',
            [
              ['state', 'enum', ['ok', 'weak', 'retrying', 'lost', 'jammed']],
              ['bars', 'num', { min: 0, max: 4 }],
              ['note', 'text'],
            ],
          ];
        });
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { up: { state: 'ok', bars: 3, note: 'Connected' } };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
