/* gauge panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register(
  'gauge',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var v = typeof state.value === 'number' ? state.value : 0;
    var max = typeof panel.max === 'number' && panel.max > 0 ? panel.max : 100;
    var pct = clamp((v / max) * 100, 0, 100);
    h +=
      '<div class="gaugeval">' +
      esc(String(v)) +
      (panel.unit
        ? ' <span class="gaugeunit">' + esc(panel.unit) + '</span>'
        : '') +
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
  }
);
