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
      var st =
        l.id && state[l.id] && typeof state[l.id] === 'object'
          ? state[l.id]
          : {};
      var s = SIGNAL_STATES.indexOf(st.state) >= 0 ? st.state : 'ok';
      var bars = fin(st.bars) != null ? Math.round(clamp(st.bars, 0, 4)) : null;
      return {
        id: l.id,
        label: l.label || l.id || '',
        transport:
          SIGNAL_TRANSPORTS.indexOf(l.transport) >= 0 ? l.transport : null,
        state: s,
        bars: bars,
        note: st.note != null ? String(st.note) : '',
      };
    })
    .filter(function (l) {
      return l.id;
    });
}

/* radar widget: a top-down range view — concentric distance rings inside a
   wedge, an alert-threshold arc, named zone polygons, and a subject whose
   distance is measured. Pure model (node-testable). The engine COMPUTES:
   the subject's distance from the sensor, whether it is inside the alert
   threshold (state.alert overrides), and which zones contain it
   (point-in-polygon). The track drawn across steps is render-level (from the
   folded state history), not part of this model. Frame is 320x180, y down;
   `facing`/`spread` follow the pir convention (degrees clockwise from +x). */

PanelViews.register(
  'signal',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var sgm = signalModel(panel, state);
    h += '<div class="sgrows">';
    sgm.forEach(function (l) {
      h += '<div class="sgrow s-' + l.state + '">';
      h +=
        '<span class="sgtag">' +
        (l.transport ? esc(l.transport.toUpperCase()) : '') +
        '</span>';
      h += '<span class="sglabel">' + esc(l.label) + '</span>';
      h += '<span class="sgbars">';
      for (var sb = 1; sb <= 4; sb++)
        h +=
          '<span class="sgbar b' +
          sb +
          (l.bars != null && sb <= l.bars ? ' on' : '') +
          '"></span>';
      h += '</span>';
      h += '<span class="sgstate">' + l.state.toUpperCase() + '</span>';
      h += '<span class="sgnote">' + esc(l.note) + '</span>';
      h += '</div>';
    });
    h += '</div>';
    return { html: h };
  }
);
