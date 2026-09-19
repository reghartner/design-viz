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
      var st =
        t.id && state[t.id] && typeof state[t.id] === 'object'
          ? state[t.id]
          : {};
      var sname = st.state != null ? String(st.state) : null;
      var known =
        sname != null && (vocab.length === 0 || vocab.indexOf(sname) >= 0);
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

PanelViews.register(
  'tiles',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var tlm = tilesModel(panel, state);
    h += '<div class="tlgrid">';
    tlm.forEach(function (t) {
      h += '<div class="tltile' + (t.state == null ? ' dim' : '') + '">';
      h += '<span class="tllabel">' + esc(t.label) + '</span>';
      h +=
        '<span class="tlstate"' +
        (t.color
          ? ' style="color:' + t.color + ';border-color:' + t.color + '"'
          : '') +
        '>' +
        (t.state != null ? esc(t.state) : '&#8212;') +
        '</span>';
      h += '<span class="tlsub">' + esc(t.sub) + '</span>';
      h += '</div>';
    });
    h += '</div>';
    return { html: h };
  }
);
