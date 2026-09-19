/* xray validation and pure state helpers. */

PanelRegistry.extend('xray', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (!(Array.isArray(p.layers) && p.layers.length))
      warnings.push(
        PP +
          '.layers: xray needs layers:[{id, label, holder}], outermost first — panel renders empty'
      );
  },
});

/* xray panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function xrayModel(declared, stateLayers) {
  var st = {};
  (Array.isArray(stateLayers) ? stateLayers : []).forEach(function (l) {
    if (l && l.id) st[l.id] = l.open === true;
  });
  return (Array.isArray(declared) ? declared : []).map(function (l) {
    l = l || {};
    return {
      id: l.id,
      label: l.label || l.id || '',
      holder: l.holder || '',
      open: st[l.id] === true,
    };
  });
}

PanelViews.register('xray', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var xm = xrayModel(panel.layers, state.layers);
  var xopen = '',
    xclose = '';
  xm.forEach(function (l) {
    xopen +=
      '<div class="xlayer ' +
      (l.open ? 'open' : 'sealed') +
      '">' +
      '<div class="xhead"><span class="xstate">' +
      (l.open ? 'OPEN' : 'SEALED') +
      '</span>' +
      '<span class="xname">' +
      esc(l.label) +
      '</span>' +
      (l.holder ? '<span class="xholder">key: ' + esc(l.holder) + '</span>' : '') +
      '</div>';
    xclose = '</div>' + xclose;
  });
  h += '<div class="xray">' + xopen + '<div class="xcore">payload</div>' + xclose + '</div>';
  if (state.hop != null) {
    var readable =
      xm.length > 0 &&
      xm.every(function (l) {
        return l.open;
      });
    h +=
      '<div class="xfoot' +
      (readable ? ' yes' : ' no') +
      '">at <b>' +
      esc(String(state.hop)) +
      '</b> — payload ' +
      (readable ? 'READABLE here' : 'NOT readable here') +
      '</div>';
  }
  return { html: h };
});

PanelRegistry.extend('xray', {
  order: 9,
  label: 'Device internals',
  since: '0.1.0',
});

PanelRegistry.extend('xray', {
  styles: [
    {
      order: 989,
      css: String.raw`.xlayer{border-radius:9px; padding:7px 9px 9px;}
.xlayer + .xcore, .xlayer .xlayer, .xlayer .xcore{margin-top:6px;}
.xlayer.sealed{border:1.5px solid;}
.xlayer.open{border:1.5px dashed;}
.sk-aurora .xlayer.sealed{border-color:#3B4A63; background:rgba(16,26,44,.55);}
.sk-aurora .xlayer.open{border-color:#38E1FF; background:rgba(12,34,48,.5);}
.sk-daylight .xlayer.sealed{border-color:#C9C4B8; background:#F8F6F0;}
.sk-daylight .xlayer.open{border-color:#4956C9; background:#EEF0FB;}`,
    },
    {
      order: 999,
      css: String.raw`.sk-aurora .xlayer.sealed .xstate{background:#101A2C; color:#55627A;}
.sk-aurora .xlayer.open .xstate{background:#0C2230; color:#8AE8FF;}
.sk-daylight .xlayer.sealed .xstate{background:#EFEDE6; color:#9A958A;}
.sk-daylight .xlayer.open .xstate{background:#E2E6FA; color:#4956C9;}`,
    },
    {
      order: 1005,
      css: String.raw`.xholder{font-size:9.5px; margin-left:auto;}
.sk-aurora .xholder{color:#5E7396;}
.sk-daylight .xholder{color:#8A8474;}`,
    },
    {
      order: 1011,
      css: String.raw`.xfoot{font:600 10.5px 'IBM Plex Mono',monospace; margin-top:8px;}
.sk-aurora .xfoot.yes{color:#4ADE80;}
.sk-aurora .xfoot.no{color:#F87171;}
.sk-daylight .xfoot.yes{color:#0E9382;}
.sk-daylight .xfoot.no{color:#B91C1C;}
.sk-aurora .xfoot b{color:#EAF2FF;}
.sk-daylight .xfoot b{color:#23272E;}`,
    },
    {
      order: 1440,
      css: String.raw`body.sk-editorial .sk-aurora .xlayer.sealed,
body.sk-editorial .sk-daylight .xlayer.sealed{border-color:var(--ed-rule-strong); background:var(--ed-paper);}
body.sk-editorial .sk-aurora .xlayer.open,
body.sk-editorial .sk-daylight .xlayer.open{border-color:var(--ed-accent); background:var(--ed-accent-soft);}
body.sk-editorial .xlayer{border-radius:2px;}
body.sk-editorial .sk-aurora .xlayer.sealed .xstate,
body.sk-editorial .sk-daylight .xlayer.sealed .xstate{color:var(--ed-muted); background:#E5DED2;}
body.sk-editorial .sk-aurora .xlayer.open .xstate,
body.sk-editorial .sk-daylight .xlayer.open .xstate{color:var(--ed-accent-deep); background:#CFE1DC;}`,
    },
    {
      order: 1446,
      css: String.raw`body.sk-editorial .sk-aurora .xname,
body.sk-editorial .sk-daylight .xname,
body.sk-editorial .sk-aurora .xfoot b,
body.sk-editorial .sk-daylight .xfoot b{color:var(--ed-ink);}
body.sk-editorial .sk-aurora .xholder,
body.sk-editorial .sk-daylight .xholder{color:var(--ed-muted);}`,
    },
    {
      order: 1449,
      css: String.raw`body.sk-editorial .sk-aurora .xfoot.yes,
body.sk-editorial .sk-daylight .xfoot.yes{color:var(--ed-good);}
body.sk-editorial .sk-aurora .xfoot.no,
body.sk-editorial .sk-daylight .xfoot.no{color:var(--ed-bad);}`,
    },
    {
      order: 1646,
      css: String.raw`@media screen {

  body.sk-terminal .xlayer,
  body.sk-terminal .xcore{border-radius:0;}
}
@media screen {
  body.sk-terminal .sk-aurora .xlayer.sealed{color:var(--tm-text); background:var(--tm-raised); border:1px solid var(--tm-line);}
}
@media screen {
  body.sk-terminal .sk-aurora .xlayer.open{color:var(--tm-text); background:#07100C; border:1px dashed var(--tm-good);}
}`,
    },
    {
      order: 1650,
      css: String.raw`@media screen {
  body.sk-terminal .sk-aurora .xlayer.sealed .xstate{color:var(--tm-muted); background:var(--tm-line-dim);}
}
@media screen {
  body.sk-terminal .sk-aurora .xlayer.open .xstate{color:var(--tm-good); background:#0B1912;}
}`,
    },
    {
      order: 1653,
      css: String.raw`@media screen {
  body.sk-terminal .sk-aurora .xholder{color:var(--tm-muted);}
}`,
    },
    {
      order: 1655,
      css: String.raw`@media screen {
  body.sk-terminal .sk-aurora .xfoot.yes{color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .xfoot.no{color:var(--tm-alert);}
}`,
    },
    {
      order: 1868,
      css: String.raw`@media screen {

  body.sk-pastel .xlayer { border-radius:12px; }
}
@media screen {
  body.sk-pastel .sk-aurora .xlayer.sealed,
  body.sk-pastel .sk-daylight .xlayer.sealed { border-color:#D4DDE8; background:#F7F9FC; }
}
@media screen {
  body.sk-pastel .sk-aurora .xlayer.open,
  body.sk-pastel .sk-daylight .xlayer.open { border-color:#9AA6DE; background:#F0F2FF; }
}`,
    },
    {
      order: 1872,
      css: String.raw`@media screen {
  body.sk-pastel .sk-aurora .xlayer.sealed .xstate,
  body.sk-pastel .sk-daylight .xlayer.sealed .xstate { color:#748095; background:#E9EDF3; }
}
@media screen {
  body.sk-pastel .sk-aurora .xlayer.open .xstate,
  body.sk-pastel .sk-daylight .xlayer.open .xstate { color:#5263B9; background:#E2E6FB; }
}
@media screen {
  body.sk-pastel .sk-aurora .xname,
  body.sk-pastel .sk-daylight .xname,
  body.sk-pastel .sk-aurora .xfoot b,
  body.sk-pastel .sk-daylight .xfoot b { color:#2D3B54; }
}
@media screen {
  body.sk-pastel .sk-aurora .xholder,
  body.sk-pastel .sk-daylight .xholder { color:#7B8799; }
}`,
    },
    {
      order: 1877,
      css: String.raw`@media screen {
  body.sk-pastel .sk-aurora .xfoot.yes,
  body.sk-pastel .sk-daylight .xfoot.yes { color:#287A55; }
}
@media screen {
  body.sk-pastel .sk-aurora .xfoot.no,
  body.sk-pastel .sk-daylight .xfoot.no { color:#B44755; }
}`,
    },
    {
      order: 2103,
      css: String.raw`@media screen {

  body.sk-blueprint .xlayer{padding:5px 7px 7px;border-radius:0;}
}
@media screen {
  body.sk-blueprint .xlayer + .xcore,body.sk-blueprint .xlayer .xlayer,body.sk-blueprint .xlayer .xcore{margin-top:4px;}
}
@media screen {
  body.sk-blueprint .docview .xlayer.sealed{border-color:#6EA9C1;background:#04244B;}
}
@media screen {
  body.sk-blueprint .docview .xlayer.open{border-color:#58E7FF;background:#06386B;}
}`,
    },
    {
      order: 2108,
      css: String.raw`@media screen {
  body.sk-blueprint .docview .xlayer.sealed .xstate{background:#052956;color:#A4C4D4;}
}
@media screen {
  body.sk-blueprint .docview .xlayer.open .xstate{background:#0B4A7E;color:#D9FAFF;}
}`,
    },
    {
      order: 2111,
      css: String.raw`@media screen {
  body.sk-blueprint .docview .xholder{color:#A0C4D6;}
}`,
    },
    {
      order: 2114,
      css: String.raw`@media screen {
  body.sk-blueprint .docview .xfoot.yes{color:#47F590;}
}
@media screen {
  body.sk-blueprint .docview .xfoot.no{color:#FF7881;}
}
@media screen {
  body.sk-blueprint .docview .xfoot b{color:#FFFFFF;}
}`,
    },
  ],
});

/* xray authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('xray', {
  authoring: {
    template: {
      title: 'Layers',
      layers: [
        { id: 'case', label: 'Case', holder: true },
        { id: 'board', label: 'Board' },
      ],
    },
    setupFields: [
      ['layers', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }, { k: 'holder' }] }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['layers', 'jsonArr'],
      ['hop', 'text'],
    ],
    picker: {
      order: 26,
      name: 'Layer X-ray',
      category: 'Devices & interfaces',
      tagline: 'Look through the layers',
      description:
        'Explain nested layers, who holds each key, and where a payload becomes readable.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.layers[0].holder = 'Gateway';
      state = {
        layers: [
          { id: 'case', open: true },
          { id: 'board', open: false },
        ],
        hop: 'gateway',
      };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
