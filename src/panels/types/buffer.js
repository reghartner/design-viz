/* buffer panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var BUFFER_CELL_STATES = [
  'empty',
  'buffered',
  'protected',
  'uploading',
  'uploaded',
  'dropped',
];
function bufferModel(panel, state) {
  panel = panel || {};
  state = state || {};
  var n =
    typeof panel.segments === 'number' && isFinite(panel.segments)
      ? Math.round(clamp(panel.segments, 2, 48))
      : 12;
  /* mark: cumulative inclusive range paints [[i0,i1,"state"],...] applied
     over the cells base in order (shared bufferPaint helper — the fold
     compactor uses the same function, so a compacted story renders
     identically to an uncompacted one). */
  var cells = bufferPaint(n, state.cells, state.mark);
  var head =
    typeof state.head === 'number' &&
    isFinite(state.head) &&
    state.head >= 0 &&
    state.head < n
      ? Math.round(state.head)
      : null;
  var counts = {};
  cells.forEach(function (c) {
    counts[c] = (counts[c] || 0) + 1;
  });
  var parts = [];
  BUFFER_CELL_STATES.forEach(function (sname) {
    if (sname !== 'empty' && counts[sname])
      parts.push(counts[sname] + ' ' + sname);
  });
  return {
    n: n,
    cells: cells,
    head: head,
    counts: counts,
    capacity: panel.capacity != null ? String(panel.capacity) : '',
    note:
      state.note != null
        ? String(state.note)
        : state.label != null
        ? String(state.label)
        : '',
    summary: parts.length ? parts.join(' · ') : 'empty',
  };
}

/* inflight widget: operations/messages as bars on one shared step axis.
   foldInflightStates (validator.js) supplies complete history snapshots;
   this pure model vets that snapshot for the HTML renderer. */
/* timeline: wall-clock axis over a declared span with periodic cadence
   beats and event dots; steps sweep a `now` cursor and append events.
   Pure model (node-testable, no DOM). */

PanelViews.register(
  'buffer',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var bfm = bufferModel(panel, state);
    /* head row: one marker slot per cell so the ▼ sits over the write head */
    h += '<div class="bfhead">';
    for (var bh = 0; bh < bfm.n; bh++)
      h +=
        '<span class="bfmark' +
        (bfm.head === bh ? ' on' : '') +
        '">' +
        (bfm.head === bh ? '&#9660;' : '') +
        '</span>';
    h += '</div>';
    h += '<div class="bfrow">';
    bfm.cells.forEach(function (c) {
      h += '<span class="bfcell s-' + c + '"></span>';
    });
    h += '</div>';
    h +=
      '<div class="bffoot"><span class="bfsum">' +
      esc(bfm.summary) +
      '</span>' +
      (bfm.capacity
        ? '<span class="bfcap">' + esc(bfm.capacity) + '</span>'
        : '') +
      '</div>';
    /* note line always emitted (fixed height — never reflows the column) */
    h += '<div class="bfnote">' + esc(bfm.note) + '</div>';
    return { html: h };
  }
);
