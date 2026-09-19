/* leds panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register('leds', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  h += '<div class="ledrow">';
  (panel.leds || []).forEach(function (l) {
    var mode = String(state[l.id] || 'off');
    if (['on', 'off', 'tx', 'rx'].indexOf(mode) < 0) mode = 'off';
    h +=
      '<span class="led"><span class="leddot ' +
      mode +
      '"></span>' +
      esc(l.label || l.id) +
      '</span>';
  });
  h += '</div>';
  return { html: h };
});

PanelRegistry.extend('leds', {
  order: 1,
  label: 'LEDs',
  since: '0.1.0',
});

PanelRegistry.extend('leds', {
  styles: [
    {
      order: 316,
      css: String.raw`.ledrow{display:flex; flex-wrap:wrap; gap:12px;}
.led{display:flex; align-items:center; gap:6px; font:600 10.5px 'IBM Plex Mono',monospace;}
.sk-aurora .led{color:#93A7C9;}
.sk-daylight .led{color:#6B6F7A;}
.leddot{width:9px; height:9px; border-radius:50%; display:inline-block;}
.leddot.off{background:#333D49;}
.leddot.on{background:#4ADE80; box-shadow:0 0 5px rgba(74,222,128,.8);}
.leddot.tx{background:#38E1FF; box-shadow:0 0 5px rgba(56,225,255,.8); animation:ledpulse .5s ease-in-out infinite alternate;}
.leddot.rx{background:#F471B5; box-shadow:0 0 5px rgba(244,113,181,.8); animation:ledpulse .5s ease-in-out infinite alternate;}`,
    },
    {
      order: 1359,
      css: String.raw`body.sk-editorial .leddot.on,
body.sk-editorial .leddot.tx,
body.sk-editorial .leddot.rx{box-shadow:none;}
body.sk-editorial .leddot.off{background:#AAA79F;}`,
    },
    {
      order: 1431,
      css: String.raw`body.sk-editorial .leddot.tx{background:var(--ed-accent);}
body.sk-editorial .leddot.rx{background:#8A4566;}`,
    },
    {
      order: 1571,
      css: String.raw`@media screen {
  body.sk-terminal .ledrow{gap:11px;}
}
@media screen {
  body.sk-terminal .led,
  body.sk-terminal .sk-aurora .led{color:var(--tm-text); font-size:9px; letter-spacing:.08em; text-transform:uppercase;}
}
@media screen {
  body.sk-terminal .leddot{width:8px; height:8px; border-radius:0; border:1px solid var(--tm-line);}
}
@media screen {
  body.sk-terminal .leddot.off{background:var(--tm-line-dim);}
}
@media screen {
  body.sk-terminal .leddot.on,
  body.sk-terminal .leddot.tx{background:var(--tm-good); border-color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .leddot.rx{background:var(--tm-alert); border-color:var(--tm-alert);}
}`,
    },
    {
      order: 1778,
      css: String.raw`@media screen {
  body.sk-pastel .led,
  body.sk-pastel .sk-aurora .led,
  body.sk-pastel .sk-daylight .led {
    color:#647188;
    font-family:'Source Sans 3',sans-serif;
    font-size:11px;
    font-weight:700;
  }
}
@media screen {
  body.sk-pastel .leddot { width:10px; height:10px; border:2px solid #FFFFFF; box-shadow:0 0 0 1px #D8E0EB; }
}
@media screen {
  body.sk-pastel .leddot.off { background:#C6CEDA; }
}
@media screen {
  body.sk-pastel .leddot.on { background:#59AA7C; box-shadow:0 0 0 1px #8FC9A8, 0 0 7px rgba(65,145,99,.34); }
}
@media screen {
  body.sk-pastel .leddot.tx { background:#6BA7CE; box-shadow:0 0 0 1px #A8CADE, 0 0 7px rgba(78,143,183,.34); }
}
@media screen {
  body.sk-pastel .leddot.rx { background:#C477A4; box-shadow:0 0 0 1px #DAB0C9, 0 0 7px rgba(170,79,132,.30); }
}`,
    },
    {
      order: 2014,
      css: String.raw`@media screen {

  body.sk-blueprint .ledrow{gap:10px;}
}
@media screen {
  body.sk-blueprint .docview .led{color:#D0E6F2;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;letter-spacing:.06em;}
}
@media screen {
  body.sk-blueprint .leddot{width:8px;height:8px;}
}
@media screen {
  body.sk-blueprint .leddot.off{background:#47779B;box-shadow:inset 0 0 0 1px #80A9C1;}
}
@media screen {
  body.sk-blueprint .leddot.on{background:#47F590;box-shadow:0 0 6px rgba(71,245,144,.82);}
}
@media screen {
  body.sk-blueprint .leddot.tx{background:#58E7FF;box-shadow:0 0 6px rgba(88,231,255,.85);}
}
@media screen {
  body.sk-blueprint .leddot.rx{background:#FF82C4;box-shadow:0 0 6px rgba(255,130,196,.85);}
}`,
    },
  ],
});

/* leds authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('leds', {
  authoring: {
    template: {
      title: 'Indicators',
      leds: [
        { id: 'power', label: 'PWR' },
        { id: 'radio', label: 'RADIO' },
      ],
      initial: { power: 'on' },
    },
    setupFields: [
      ['leds', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }] }],
      ['initial', 'json'],
    ],
    patchFields: [],
    picker: {
      order: 21,
      name: 'Status lights',
      category: 'Devices & interfaces',
      tagline: 'Small signals, clear meaning',
      description: 'Show power, radio, and activity indicators changing with a device’s state.',
    },
    expandPatchFields: function (decl) {
      return (Array.isArray(decl.leds) ? decl.leds : [])
        .filter(function (item) {
          return item && typeof item.id === 'string' && item.id !== '';
        })
        .map(function (item) {
          return [item.id, 'enum', ['on', 'off', 'tx', 'rx']];
        });
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { power: 'on', radio: 'tx' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
