/* state panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register('state', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var pulseSelector, pulseChanged;
  var cur = state.state != null ? String(state.state) : '—';
  pulseSelector = '.pchip.cur';
  pulseChanged = Object.prototype.hasOwnProperty.call(host, '_stateCur') && host._stateCur !== cur;
  host._stateCur = cur;
  var colors = panel.colors || {};
  var col = isHex(colors[cur]) ? colors[cur] : null;
  h +=
    '<div class="preadout"' + (col ? ' style="color:' + col + '"' : '') + '>' + esc(cur) + '</div>';
  h += '<div class="prail">';
  (panel.states || []).forEach(function (st) {
    h += '<span class="pchip' + (st === cur ? ' cur' : '') + '">' + esc(st) + '</span>';
  });
  h += '</div>';
  return {
    html: h,
    pulse: { selector: pulseSelector, changed: pulseChanged },
  };
});

PanelRegistry.extend('state', {
  order: 0,
  label: 'State',
  since: '0.1.0',
});

PanelRegistry.extend('state', {
  styles: [
    {
      order: 307,
      css: String.raw`.preadout{font:700 20px 'IBM Plex Mono',monospace; margin-bottom:8px;}
.sk-aurora .preadout{color:#EAF2FF;}
.sk-daylight .preadout{color:#23272E;}
.prail{display:flex; flex-wrap:wrap; gap:4px;}
.pchip{font:600 9.5px 'IBM Plex Mono',monospace; padding:3px 7px; border-radius:6px; border:1px solid transparent;}
.sk-aurora .pchip{background:#101A2C; color:#55627A; border-color:#1D2A40;}
.sk-aurora .pchip.cur{color:#8AE8FF; border-color:#38E1FF; background:#0C2230;}
.sk-daylight .pchip{background:#F4F2EC; color:#9A958A; border-color:#E0DCD1;}
.sk-daylight .pchip.cur{color:#4956C9; border-color:#4956C9; background:#EEF0FB;}`,
    },
    { order: 334, css: String.raw`.pchip.dv-chip-pulse{animation:dvchippulse .58s ease-out;}` },
    {
      order: 1357,
      css: String.raw`body.sk-editorial .sk-aurora .pchip,
body.sk-editorial .sk-daylight .pchip{
  border-color:var(--ed-rule);
  border-radius:2px;
  color:var(--ed-muted);
  background:var(--ed-paper);
}
body.sk-editorial .sk-aurora .pchip.cur,
body.sk-editorial .sk-daylight .pchip.cur{
  border-color:var(--ed-accent);
  color:var(--ed-accent-deep);
  background:var(--ed-accent-soft);
}`,
    },
    {
      order: 1568,
      css: String.raw`@media screen {

  body.sk-terminal .prail{gap:0;}
}
@media screen {
  body.sk-terminal .pchip,
  body.sk-terminal .sk-aurora .pchip{
    margin:-1px 0 0 -1px;
    padding:3px 6px;
    color:var(--tm-muted);
    background:var(--tm-raised);
    border:1px solid var(--tm-line-dim);
    border-radius:0;
    font-size:9px;
    letter-spacing:.07em;
    text-transform:uppercase;
  }
}
@media screen {
  body.sk-terminal .sk-aurora .pchip.cur{color:var(--tm-good); background:#0B1912; border-color:var(--tm-good);}
}`,
    },
    {
      order: 1774,
      css: String.raw`@media screen {
  body.sk-pastel .preadout[style] { filter:saturate(.68) brightness(.82); }
}
@media screen {
  body.sk-pastel .prail { gap:5px; }
}
@media screen {
  body.sk-pastel .pchip,
  body.sk-pastel .sk-aurora .pchip,
  body.sk-pastel .sk-daylight .pchip {
    color:#7A869A;
    background:#F3F6FA;
    border-color:#E2E8F1;
    border-radius:999px;
    padding:4px 8px;
  }
}
@media screen {
  body.sk-pastel .sk-aurora .pchip.cur,
  body.sk-pastel .sk-daylight .pchip.cur {
    color:#5263B9;
    background:#EEF0FF;
    border-color:#C9D0F1;
    box-shadow:0 2px 7px rgba(82,99,185,.10);
  }
}`,
    },
    {
      order: 2010,
      css: String.raw`@media screen {
  body.sk-blueprint .preadout{font-size:20px;line-height:1;margin-bottom:6px;}
}
@media screen {
  body.sk-blueprint .prail{gap:3px;}
}
@media screen {
  body.sk-blueprint .docview .pchip{
    padding:2px 6px;
    border-radius:0;
    color:#84AEC5;
    background:#04234A;
    border-color:#2F7395;
  }
}
@media screen {
  body.sk-blueprint .docview .pchip.cur{color:#FFFFFF;border-color:#8EEAFF;background:#0A447E;}
}`,
    },
  ],
});

/* state authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('state', {
  authoring: {
    template: { title: 'Device state', states: ['OFF', 'BOOT', 'LIVE'], initial: { state: 'OFF' } },
    setupFields: [
      ['states', 'csv'],
      ['colors', 'map'],
      ['initial', 'json'],
    ],
    patchFields: [['state', 'text']],
    picker: {
      order: 8,
      name: 'State machine',
      category: 'State & timing',
      tagline: 'The current state, clearly',
      description: 'Highlight the current state in a compact rail of possible states.',
    },
    expandPatchFields: function (decl) {
      var states = Array.isArray(decl.states) ? decl.states.map(String) : [];
      var stateField = states.length ? ['state', 'enum', states] : ['state', 'text'];
      return [stateField];
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.state = 'LIVE';
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
