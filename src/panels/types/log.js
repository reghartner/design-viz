/* log panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register(
  'log',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var tags = panel.tags || {};
    h += '<div class="plog">';
    (state.log || []).forEach(function (line) {
      var tag = line && line.tag ? String(line.tag) : '';
      var col2 = isHex(tags[tag]) ? tags[tag] : null;
      h +=
        '<div class="plogline">' +
        (tag
          ? '<span class="plogtag"' +
            (col2 ? ' style="color:' + col2 + '"' : '') +
            '>' +
            esc(tag) +
            '</span>'
          : '') +
        '<span>' +
        esc(line && line.text != null ? line.text : String(line)) +
        '</span></div>';
    });
    h += '</div>';
    return {
      html: h,
      mounted: function () {
        var log = host.querySelector('.plog');
        if (log && typeof log.scrollHeight === 'number')
          log.scrollTop = log.scrollHeight;
      },
    };
  },
  { growing: true }
);
