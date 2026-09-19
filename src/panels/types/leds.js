/* leds panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register(
  'leds',
  function (host, panel, state, skin, states, stepIdx, animate) {
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
  }
);
