/* Table snapshots are authored rows, never executable queries. */
var TABLE_STATUSES = ['neutral', 'added', 'changed', 'removed'];
function tablePatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path, p, warnings) {
    var ids = softwarePanelItems(p).map(function (item) {
      return item.id;
    });
    if (state.rows != null) {
      if (!Array.isArray(state.rows))
        warnings.push(path + '.rows: expected an array — rendered empty');
      else {
        if (state.rows.length > 12) warnings.push(path + '.rows: only the first 12 rows render');
        var seen = Object.create(null);
        state.rows.forEach(function (row, i) {
          var at = path + '.rows[' + i + ']';
          if (!panelObject(row) || typeof row.id !== 'string' || !row.id) {
            warnings.push(at + '.id: needs a non-empty string — row skipped');
            return;
          }
          if (seen[row.id]) warnings.push(at + '.id: duplicate row id — later row skipped');
          seen[row.id] = true;
          if (!panelObject(row.cells))
            warnings.push(at + '.cells: expected an object keyed by column id');
          else
            Object.keys(row.cells).forEach(function (id) {
              if (ids.indexOf(id) < 0)
                warnings.push(at + '.cells.' + id + ': unknown column — ignored');
              else if (row.cells[id] != null && typeof row.cells[id] === 'object')
                warnings.push(
                  at +
                    '.cells.' +
                    id +
                    ': use a string, number, boolean, or null — object rendered as JSON'
                );
            });
          if (row.status != null && TABLE_STATUSES.indexOf(row.status) < 0)
            warnings.push(
              at + '.status: expected ' + TABLE_STATUSES.join('|') + ' — using neutral'
            );
        });
      }
    }
  });
}
PanelRegistry.extend('table', {
  itemCollection: { key: 'columns', max: 4 },
  validateDeclaration: function (panel, path, warnings) {
    panelCollectionWarnings(panel, path, warnings, 'columns', 4);
    tablePatchWarnings(panel.initial, path + '.initial', panel, warnings);
  },
  validatePatch: tablePatchWarnings,
});

/* table panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function tableModel(panel, state) {
  state = state || {};
  var columns = softwarePanelItems(panel),
    seen = Object.create(null);
  var rows = (Array.isArray(state.rows) ? state.rows : [])
    .slice(0, 12)
    .filter(function (row) {
      if (!panelObject(row) || typeof row.id !== 'string' || !row.id || seen[row.id]) return false;
      seen[row.id] = true;
      return true;
    })
    .map(function (row) {
      return {
        id: row.id,
        status: TABLE_STATUSES.indexOf(row.status) >= 0 ? row.status : 'neutral',
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

PanelViews.register('table', function (host, panel, state, skin, states, stepIdx, animate) {
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
});

PanelRegistry.extend('table', {
  order: 23,
  label: 'Table',
  since: '0.1.0',
});

PanelRegistry.extend('table', {
  styles: [
    {
      order: 263,
      css: String.raw`.swtablewrap{overflow:auto; max-height:300px; border:1px solid color-mix(in srgb,var(--dtext) 20%,transparent); border-radius:6px;}
.swtablewrap:focus-visible{outline:2px solid var(--dink); outline-offset:2px;}
.swtable{width:100%; border-collapse:collapse; font:11px/1.5 'IBM Plex Mono',monospace; text-align:left;}
.swtable th,.swtable td{padding:7px 8px; border-bottom:1px solid color-mix(in srgb,var(--dtext) 14%,transparent); vertical-align:top;}
.swtable th{font-size:10px; color:var(--dink);}
.swtable td{min-width:45px; max-width:180px;}
.swtable tr:last-child td{border-bottom:0;}
.swcaption{position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%);}
.swrow-added{background:color-mix(in srgb,var(--dtext) 5%,transparent);}
.swrow-changed{background:color-mix(in srgb,var(--dtext) 9%,transparent);}
.swrow-removed td:not(:last-child){text-decoration:line-through; opacity:.7;}`,
    },
  ],
});

/* table authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('table', {
  authoring: {
    template: {
      title: 'Data state',
      columns: [
        { id: 'key', label: 'Key' },
        { id: 'value', label: 'Value' },
      ],
      initial: {
        rows: [{ id: 'item', cells: { key: 'order.status', value: 'pending' }, status: 'added' }],
      },
    },
    setupFields: [
      ['columns', 'rows', { cols: [{ k: 'id', req: true }, { k: 'label' }], max: 4 }],
      ['initial', 'json'],
    ],
    patchFields: [
      ['rows', 'jsonArr'],
      ['note', 'text'],
    ],
    picker: {
      order: 0,
      name: 'Data table',
      category: 'Software & data',
      tagline: 'Records at a glance',
      description:
        'Show rows, changed values, and record status as a request moves through your system.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.rows = [
        { id: 'order', cells: { key: 'order.status', value: 'confirmed' }, status: 'changed' },
        { id: 'payment', cells: { key: 'payment.id', value: 'pay_2048' }, status: 'added' },
        { id: 'stock', cells: { key: 'inventory', value: 'reserved' } },
      ];
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
