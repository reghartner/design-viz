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

/* pir line-of-sight widget: a mounted IR/PIR sensor projects a field-of-view
   cone; a subject dot is tested against it and rendered tripped or clear. Pure
   model (node-testable, no DOM). Frame is 320x180. `facing` is degrees measured
   clockwise from +x in screen space (y grows downward): 0=right, 90=down,
   180=left, 270=up. Containment = within range AND within half the spread of
   the facing direction. An explicit state.tripped overrides the computation. */

PanelViews.register(
  'xray',
  function (host, panel, state, skin, states, stepIdx, animate) {
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
        (l.holder
          ? '<span class="xholder">key: ' + esc(l.holder) + '</span>'
          : '') +
        '</div>';
      xclose = '</div>' + xclose;
    });
    h +=
      '<div class="xray">' +
      xopen +
      '<div class="xcore">payload</div>' +
      xclose +
      '</div>';
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
  }
);
