/* waterfall panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function waterfallModel(spans, state) {
  spans = Array.isArray(spans) ? spans : [];
  state = state || {};
  var total = 0,
    cursor = 0;
  var timed = spans.some(function (s) {
    return s && isFiniteNum(s.startMs) && s.startMs >= 0;
  });
  var measured = spans.map(function (s) {
    var ms = s && isFiniteNum(s.ms) && s.ms > 0 ? s.ms : 0;
    var start =
      s && isFiniteNum(s.startMs) && s.startMs >= 0 ? s.startMs : cursor;
    cursor = start + ms;
    total = Math.max(total, cursor);
    return { ms: ms, start: start };
  });
  var reveal =
    typeof state.reveal === 'number'
      ? clamp(state.reveal, 0, spans.length)
      : spans.length;
  var shown = 0,
    rows = [];
  spans.forEach(function (s, i) {
    var ms = measured[i].ms,
      off = measured[i].start;
    var revealed = i < reveal;
    if (revealed) shown = Math.max(shown, off + ms);
    rows.push({
      id: s && s.id,
      label: (s && (s.label || s.id)) || '',
      ms: ms,
      startMs: off,
      error: !!(s && s.error === true),
      offsetPct: total ? (off / total) * 100 : 0,
      widthPct: total ? (ms / total) * 100 : 0,
      revealed: revealed,
      highlight: !!(s && state.highlight === s.id),
    });
  });
  return {
    rows: rows,
    totalMs: total,
    shownMs: shown,
    timed: timed,
    totalLabel: state.total != null ? String(state.total) : shown + ' ms',
  };
}

PanelViews.register(
  'waterfall',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var waterfallEntrants;
    var wm = waterfallModel(panel.spans, state);
    var wfPrev = host._wfRevealed || null;
    var wfNow = wm.rows.map(function (r) {
      return r.revealed;
    });
    waterfallEntrants = wfPrev
      ? wfNow.map(function (on, i) {
          return on && !wfPrev[i];
        })
      : null;
    host._wfRevealed = wfNow;
    h += '<div class="wfall' + (wm.timed ? ' wf-timed' : '') + '">';
    wm.rows.forEach(function (r) {
      h +=
        '<div class="wfrow' +
        (r.revealed ? ' on' : '') +
        (r.highlight ? ' hl' : '') +
        (r.error ? ' wf-error' : '') +
        '" title="' +
        esc(
          r.label +
            ' · start +' +
            r.startMs +
            ' ms · duration ' +
            r.ms +
            ' ms' +
            (r.error ? ' · recorded error' : '')
        ) +
        '">' +
        '<span class="wflabel">' +
        esc(r.label) +
        '</span>' +
        '<span class="wftrack"><span class="wfbar" style="margin-left:' +
        r.offsetPct.toFixed(2) +
        '%;width:' +
        Math.max(r.widthPct, wm.timed ? 0 : 1.2).toFixed(2) +
        '%"></span></span>' +
        '<span class="wfms">' +
        (r.revealed
          ? (r.error ? '! ' : '') + esc(String(r.ms)) + ' ms'
          : '&#8212;') +
        '</span></div>';
    });
    h +=
      '<div class="wftotal">' +
      (wm.timed ? 'elapsed extent ' : 'total ') +
      '<b>' +
      esc(wm.totalLabel) +
      '</b></div></div>';
    return {
      html: h,
      enterBars: { rows: '.wfrow', bar: '.wfbar', entrants: waterfallEntrants },
    };
  }
);
