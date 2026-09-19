/* state panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register(
  'state',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var pulseSelector, pulseChanged;
    var cur = state.state != null ? String(state.state) : '—';
    pulseSelector = '.pchip.cur';
    pulseChanged =
      Object.prototype.hasOwnProperty.call(host, '_stateCur') &&
      host._stateCur !== cur;
    host._stateCur = cur;
    var colors = panel.colors || {};
    var col = isHex(colors[cur]) ? colors[cur] : null;
    h +=
      '<div class="preadout"' +
      (col ? ' style="color:' + col + '"' : '') +
      '>' +
      esc(cur) +
      '</div>';
    h += '<div class="prail">';
    (panel.states || []).forEach(function (st) {
      h +=
        '<span class="pchip' +
        (st === cur ? ' cur' : '') +
        '">' +
        esc(st) +
        '</span>';
    });
    h += '</div>';
    return {
      html: h,
      pulse: { selector: pulseSelector, changed: pulseChanged },
    };
  }
);
