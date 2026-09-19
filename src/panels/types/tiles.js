/* tiles validation and pure state helpers. */
function tileStateWarnings(obj, path, decl, warnings) {
  if (!obj || typeof obj !== 'object') return;
  var vocab = decl && Array.isArray(decl.states) ? decl.states.map(String) : [];
  if (!vocab.length) return;
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    if (v && typeof v === 'object' && v.state != null && vocab.indexOf(String(v.state)) < 0)
      warnings.push(
        path +
          '.' +
          k +
          '.state: "' +
          v.state +
          '" is not in the declared states — tile renders dimmed (valid: ' +
          vocab.join(' ') +
          ')'
      );
  });
}

/* Homemap vocabularies are shared by validation and the pure engine model.
   First token is the fallback. Only signals is reserved: this panel has its
   own fold so log/mark/enterOnce remain ordinary device ids. */

PanelRegistry.extend('tiles', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.tiles) && p.tiles.length))
      warnings.push(PP + '.tiles: tiles needs tiles:[{id, label}] — panel renders empty');
    else {
      if (p.tiles.length > 12)
        warnings.push(PP + '.tiles: more than 12 tiles — extra tiles are not rendered');
      p.tiles.forEach(function (t, tj) {
        if (!t || !t.id) warnings.push(PP + '.tiles[' + tj + ']: needs an id — tile skipped');
      });
    }
    tileStateWarnings(p.initial, PP + '.initial', p, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    tileStateWarnings(patch, path, panel, warnings);
  },
});

/* tiles panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function tilesModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var vocab = Array.isArray(panel.states) ? panel.states.map(String) : [];
  var colors = panel.colors || {};
  return (Array.isArray(panel.tiles) ? panel.tiles : [])
    .slice(0, 12)
    .map(function (t) {
      t = t || {};
      var st = t.id && state[t.id] && typeof state[t.id] === 'object' ? state[t.id] : {};
      var sname = st.state != null ? String(st.state) : null;
      var known = sname != null && (vocab.length === 0 || vocab.indexOf(sname) >= 0);
      return {
        id: t.id,
        label: t.label || t.id || '',
        state: known ? sname : null,
        color: known && isHex(colors[sname]) ? colors[sname] : null,
        sub: st.sub != null ? String(st.sub) : '',
      };
    })
    .filter(function (t) {
      return t.id;
    });
}

/* signal widget: link health for 1–6 named radio/wired links. Pure model
   (node-testable). Links are DECLARED once (id, label, transport tag); each
   step patches per link id, like the leds widget: a patch value replaces that
   link's whole status object `{state, bars, note}`. Unknown state tokens fall
   back to 'ok' (validator warns); bars 0–4 or null (chip-only). */

PanelViews.register('tiles', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var tlm = tilesModel(panel, state);
  h += '<div class="tlgrid">';
  tlm.forEach(function (t) {
    h += '<div class="tltile' + (t.state == null ? ' dim' : '') + '">';
    h += '<span class="tllabel">' + esc(t.label) + '</span>';
    h +=
      '<span class="tlstate"' +
      (t.color ? ' style="color:' + t.color + ';border-color:' + t.color + '"' : '') +
      '>' +
      (t.state != null ? esc(t.state) : '&#8212;') +
      '</span>';
    h += '<span class="tlsub">' + esc(t.sub) + '</span>';
    h += '</div>';
  });
  h += '</div>';
  return { html: h };
});

PanelRegistry.extend('tiles', {
  order: 18,
  label: 'Tiles',
  since: '0.1.0',
});

PanelRegistry.extend('tiles', {
  styles: [
    {
      order: 910,
      css: String.raw`.tlgrid{display:grid; grid-template-columns:repeat(auto-fill, minmax(88px, 1fr)); gap:7px;}
.tltile{display:flex; flex-direction:column; gap:3px; padding:7px 8px; border-radius:8px;}
.sk-aurora .tltile{background:#101A2C; border:1px solid #1D2A40;}
.sk-daylight .tltile{background:#F4F2EC; border:1px solid #E0DCD1;}
.tltile.dim{opacity:.55;}
.tllabel{font:600 9.5px 'IBM Plex Mono',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.sk-aurora .tllabel{color:#93A7C9;}
.sk-daylight .tllabel{color:#6B6F7A;}
.tlstate{font:700 9.5px 'IBM Plex Mono',monospace; letter-spacing:.06em; align-self:flex-start;
  padding:1px 6px; border-radius:5px; border:1px solid;}
.sk-aurora .tlstate{color:#55627A; border-color:#1D2A40;}
.sk-daylight .tlstate{color:#9A958A; border-color:#E0DCD1;}
.tlsub{font:500 9px 'IBM Plex Mono',monospace; height:12px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;}
.sk-aurora .tlsub{color:#5E7396;}
.sk-daylight .tlsub{color:#8A8474;}`,
    },
    {
      order: 1425,
      css: String.raw`body.sk-editorial .sk-aurora .tltile,
body.sk-editorial .sk-daylight .tltile{
  border-color:var(--ed-rule);
  border-radius:2px;
  background:var(--ed-paper);
}
body.sk-editorial .sk-aurora .tllabel,
body.sk-editorial .sk-daylight .tllabel{color:#515A57;}
body.sk-editorial .sk-aurora .tlstate,
body.sk-editorial .sk-daylight .tlstate{color:var(--ed-muted); border-color:var(--ed-rule-strong); border-radius:2px;}
body.sk-editorial .sk-aurora .tlsub,
body.sk-editorial .sk-daylight .tlsub{color:var(--ed-muted);}`,
    },
    {
      order: 1679,
      css: String.raw`@media screen {

  body.sk-terminal .tlgrid{gap:5px;}
}
@media screen {
  body.sk-terminal .tltile,
  body.sk-terminal .sk-aurora .tltile{padding:7px; background:var(--tm-raised); border:1px solid var(--tm-line); border-radius:0;}
}
@media screen {
  body.sk-terminal .tllabel,
  body.sk-terminal .sk-aurora .tllabel{color:var(--tm-text); text-transform:uppercase; letter-spacing:.05em;}
}
@media screen {
  body.sk-terminal .tlstate{
    color:var(--tm-good) !important;
    background:#0B1912;
    border:1px solid var(--tm-good) !important;
    border-radius:0;
    text-transform:uppercase;
  }
}
@media screen {
  body.sk-terminal .tlsub,
  body.sk-terminal .sk-aurora .tlsub{color:var(--tm-muted);}
}`,
    },
    {
      order: 1895,
      css: String.raw`@media screen {

  body.sk-pastel .tltile,
  body.sk-pastel .sk-aurora .tltile,
  body.sk-pastel .sk-daylight .tltile {
    background:#F7F9FC;
    border:1px solid #E0E6EF;
    border-radius:11px;
    padding:8px 9px;
  }
}
@media screen {
  body.sk-pastel .tllabel,
  body.sk-pastel .tlsub,
  body.sk-pastel .sk-aurora .tllabel,
  body.sk-pastel .sk-daylight .tllabel,
  body.sk-pastel .sk-aurora .tlsub,
  body.sk-pastel .sk-daylight .tlsub { color:#647188; }
}
@media screen {
  body.sk-pastel .tlstate,
  body.sk-pastel .sk-aurora .tlstate,
  body.sk-pastel .sk-daylight .tlstate { color:#738095; border-color:#D4DCE7; border-radius:999px; }
}
@media screen {
  body.sk-pastel .tlstate[style] { filter:saturate(.72) brightness(.84); }
}`,
    },
    {
      order: 2135,
      css: String.raw`@media screen {

  body.sk-blueprint .tlgrid{grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:5px;}
}
@media screen {
  body.sk-blueprint .tltile{gap:2px;padding:5px 6px;border-radius:0;}
}
@media screen {
  body.sk-blueprint .docview .tltile{background:#04244B;border-color:#347B9A;}
}
@media screen {
  body.sk-blueprint .docview .tllabel{color:#D1E7F1;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:10px;letter-spacing:.04em;}
}
@media screen {
  body.sk-blueprint .tlstate{padding:1px 5px;border-radius:0;font-family:'Barlow Condensed','Arial Narrow',sans-serif;}
}
@media screen {
  body.sk-blueprint .docview .tlsub{color:#91B9CE;}
}`,
    },
  ],
});

/* tiles authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('tiles', {
  authoring: {
    template: {
      title: 'Fleet',
      tiles: [
        { id: 't1', label: 'UNIT 1' },
        { id: 't2', label: 'UNIT 2' },
      ],
    },
    setupFields: [
      ['tiles', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }], max: 12 }],
      ['states', 'csv'],
      ['colors', 'map'],
      ['initial', 'json'],
    ],
    patchFields: [],
    picker: {
      order: 23,
      name: 'Device fleet',
      category: 'Devices & interfaces',
      tagline: 'Many devices, one view',
      description: 'Compare named devices in a compact grid, each with its own status and detail.',
    },
    expandPatchFields: function (decl) {
      var states = Array.isArray(decl.states) ? decl.states.map(String) : [];
      var stateField = states.length ? ['state', 'enum', states] : ['state', 'text'];
      return (Array.isArray(decl.tiles) ? decl.tiles : [])
        .filter(function (item) {
          return item && typeof item.id === 'string' && item.id !== '';
        })
        .map(function (item) {
          return [item.id, 'objf', [stateField, ['sub', 'text']]];
        });
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { t1: { state: 'ONLINE', sub: 'Gateway' }, t2: { state: 'READY', sub: 'Camera' } };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
