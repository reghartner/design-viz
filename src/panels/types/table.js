/* table panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function tableModel(panel, state) {
  state = state || {};
  var columns = softwarePanelItems(panel),
    seen = Object.create(null);
  var rows = (Array.isArray(state.rows) ? state.rows : [])
    .slice(0, 12)
    .filter(function (row) {
      if (
        !panelObject(row) ||
        typeof row.id !== 'string' ||
        !row.id ||
        seen[row.id]
      )
        return false;
      seen[row.id] = true;
      return true;
    })
    .map(function (row) {
      return {
        id: row.id,
        status:
          TABLE_STATUSES.indexOf(row.status) >= 0 ? row.status : 'neutral',
        cells: columns.map(function (col) {
          if (!panelOwn(row.cells, col.id)) return '—';
          var v = row.cells[col.id];
          if (v === null) return 'null';
          return typeof v === 'object' ? JSON.stringify(v) : String(v);
        }),
      };
    });
  return { columns: columns, rows: rows };
}

PanelViews.register(
  'table',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var table = tableModel(panel, state);
    h +=
      '<div class="swtablewrap" tabindex="0" role="region" aria-label="' +
      esc(panel.title || 'Data state') +
      '">' +
      '<table class="swtable"><caption class="swcaption">' +
      esc(panel.title || 'Data state') +
      '</caption><thead><tr>';
    table.columns.forEach(function (col) {
      h += '<th scope="col">' + esc(col.label || col.id) + '</th>';
    });
    h += '<th scope="col">Change</th></tr></thead><tbody>';
    table.rows.forEach(function (row) {
      h += '<tr class="swrow-' + row.status + '">';
      row.cells.forEach(function (cell) {
        h += '<td>' + esc(cell) + '</td>';
      });
      h +=
        '<td><span class="swbadge sw-' +
        row.status +
        '">' +
        (row.status === 'neutral' ? '—' : row.status) +
        '</span></td></tr>';
    });
    if (!table.rows.length)
      h +=
        '<tr><td colspan="' +
        (table.columns.length + 1) +
        '" class="swempty">No rows at this step</td></tr>';
    h += '</tbody></table></div>';
    h = softwarePanelShell(h, state);
    return { html: h };
  }
);
