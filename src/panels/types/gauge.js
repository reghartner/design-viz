/* gauge panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register('gauge', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var v = typeof state.value === 'number' ? state.value : 0;
  var max = typeof panel.max === 'number' && panel.max > 0 ? panel.max : 100;
  var pct = clamp((v / max) * 100, 0, 100);
  h +=
    '<div class="gaugeval">' +
    esc(String(v)) +
    (panel.unit ? ' <span class="gaugeunit">' + esc(panel.unit) + '</span>' : '') +
    '</div>';
  h +=
    '<div class="gaugebar"><div class="gaugefill" style="width:' +
    pct.toFixed(1) +
    '%"></div></div>';
  return {
    html: h,
    level: {
      pct: pct,
      value: v,
      fill: '.gaugefill',
      readout: '.gaugeval',
      decimals: panelDecimalPlaces(v),
    },
  };
});

PanelRegistry.extend('gauge', {
  order: 2,
  label: 'Gauge',
  since: '0.1.0',
});

PanelRegistry.extend('gauge', {
  styles: [
    {
      order: 326,
      css: String.raw`.gaugeval{font:700 16px 'IBM Plex Mono',monospace; margin-bottom:6px;}
.sk-aurora .gaugeval{color:#EAF2FF;}
.sk-daylight .gaugeval{color:#23272E;}
.gaugeunit{font-size:11px; font-weight:500; opacity:.6;}
.gaugebar{height:8px; border-radius:4px; overflow:hidden;}
.sk-aurora .gaugebar{background:#101A2C;}
.sk-daylight .gaugebar{background:#F4F2EC;}
.gaugefill{height:100%; border-radius:4px; background:linear-gradient(90deg,#4ADE80,#FFB454,#F87171); transition:width .5s ease;}`,
    },
    {
      order: 1362,
      css: String.raw`body.sk-editorial .gaugefill{border-radius:1px; box-shadow:none;}`,
    },
    {
      order: 1578,
      css: String.raw`@media screen {
  body.sk-terminal .gaugefill{border-radius:0; background:linear-gradient(90deg,var(--tm-good) 0 72%,var(--tm-alert) 72% 100%);}
}`,
    },
    {
      order: 1785,
      css: String.raw`@media screen {
  body.sk-pastel .gaugebar { height:9px; border-radius:999px; }
}
@media screen {
  body.sk-pastel .gaugefill { border-radius:999px; background:linear-gradient(90deg,#6FBA91,#D4A55F,#D76F79); }
}`,
    },
    {
      order: 2021,
      css: String.raw`@media screen {

  body.sk-blueprint .gaugeval{font-size:17px;margin-bottom:4px;}
}`,
    },
    {
      order: 2023,
      css: String.raw`@media screen {
  body.sk-blueprint .gaugefill{
    border-radius:0;
    background:linear-gradient(90deg,#47F590 0 48%,#FFD166 72%,#FF5C67 100%);
  }
}`,
    },
  ],
});

/* gauge authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('gauge', {
  authoring: {
    template: { title: 'Draw', unit: 'mA', max: 400, initial: { value: 12 } },
    setupFields: [
      ['unit', 'text'],
      ['max', 'num'],
      ['initial', 'json'],
    ],
    patchFields: [['value', 'num']],
    picker: {
      order: 12,
      name: 'Value gauge',
      category: 'State & timing',
      tagline: 'One number and its range',
      description: 'Track a changing measurement against a maximum, with a clear numeric readout.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.value = 248;
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
