/* Authored property combinations and UX outputs; no inferred device logic. */
function truthTableCases(panel) { return panelCollectionItems(panel, 'cases', 24); }
function truthTableState(raw, panel, path, warnings, allowOnce) {
  var out = Object.create(null), ids = truthTableCases(panel).map(function (row) { return row.id; });
  function warn(key, message) { if (warnings) warnings.push(path + key + ': ' + message); }
  if (raw == null) return out;
  if (!panelObject(raw)) { warn('', 'expected a state object — ignored'); return out; }
  Object.keys(raw).forEach(function (key) {
    var value = raw[key];
    if (key === 'active') {
      if (value === null || typeof value === 'string' && ids.indexOf(value) >= 0) out.active = value;
      else warn('.active', 'expected a declared case ID or null — ignored');
    } else if (key === 'note') {
      if (value === null || typeof value === 'string') out.note = value;
      else warn('.note', 'expected text or null — ignored');
    } else if (key === 'enterOnce' && allowOnce) {
      if (panelObject(value)) out.enterOnce = truthTableState(value, panel, path + '.enterOnce', warnings, false);
      else warn('.enterOnce', 'expected a state object — ignored');
    } else warn('.' + key, 'unknown field — ignored');
  });
  return out;
}
function truthTableScalar(value) { return value === null || ['string', 'boolean'].indexOf(typeof value) >= 0 || typeof value === 'number' && isFinite(value); }
function truthTableCell(value) { return value === undefined ? '—' : value === null ? 'null' : value === '' ? '(empty)' : truthTableScalar(value) ? String(value) : '—'; }
function truthTableValueColumns(panel) { return softwarePanelItems(panel).filter(function (col) { return col.kind !== 'icons'; }); }
function truthTableIconCell(outputs) {
  if (!Array.isArray(outputs)) return '—';
  var icons = outputs.slice(0, 8).filter(function (output) { return panelObject(output) && FlowIcons.has(output.icon); });
  var html = '<div class="truth-table-icons">';
  icons.forEach(function (output) {
    var label = typeof output.label === 'string' && output.label ? output.label : FlowIcons.registry[output.icon].label;
    html += '<span class="truth-table-output">' + FlowIcons.render(output.icon, {label: label}) + '<span aria-hidden="true">' + esc(label) + '</span></span>';
  });
  return html + (icons.length ? '' : outputs.length ? '—' : '<span>No icons</span>') + '</div>';
}
function truthTableCaseRows(panel) {
  var rows = panelTableEditorRows(panel.cases, truthTableValueColumns(panel));
  if (rows) rows.forEach(function (row, i) { row.label = panel.cases[i].label; });
  return rows;
}
function truthTableCollectCases(items, panel) {
  var result = panelTableEditorCollect(items, panel.cases, truthTableValueColumns(panel), true);
  if (result.error) return result;
  result.value.forEach(function (row, i) {
    if (items[i].label === undefined) delete row.label; else row.label = items[i].label;
  });
  return result;
}
PanelRegistry.define('truth-table', {
  label: 'Truth table', since: '0.2.0', order: 31,
  itemCollection: {key: 'columns', max: 8},
  validateDeclaration: function (panel, path, warnings) {
    panelCollectionWarnings(panel, path, warnings, 'columns', 8, function (col, at) {
      if (col.kind !== undefined && col.kind !== 'value' && col.kind !== 'icons') warnings.push(at + '.kind: expected value or icons — using value');
    });
    var columns = softwarePanelItems(panel);
    panelCollectionWarnings(panel, path, warnings, 'cases', 24, function (row, at) {
      if (!panelObject(row.cells)) warnings.push(at + '.cells: expected an object keyed by column ID — empty cells shown');
      else Object.keys(row.cells).forEach(function (id) {
        var col = columns.filter(function (column) { return column.id === id; })[0];
        var value = row.cells[id], cellPath = at + '.cells.' + id;
        if (!col) { warnings.push(cellPath + ': unknown column — ignored'); return; }
        if (col.kind !== 'icons') {
          if (!truthTableScalar(value)) warnings.push(cellPath + ': expected a string, finite number, boolean or null — empty cell shown');
          return;
        }
        if (!Array.isArray(value)) { warnings.push(cellPath + ': expected an array of {icon, label?} — empty cell shown'); return; }
        if (value.length > 8) warnings.push(cellPath + ': only the first 8 icons render');
        value.forEach(function (output, i) {
          if (!panelObject(output) || !FlowIcons.has(output.icon)) warnings.push(cellPath + '[' + i + '].icon: unknown shared icon — skipped');
          if (panelObject(output) && output.label !== undefined && typeof output.label !== 'string') warnings.push(cellPath + '[' + i + '].label: expected text — using icon name');
        });
      });
    });
    truthTableState(panel.initial, panel, path + '.initial', warnings, false);
  },
  validatePatch: function (patch, path, panel, warnings) { truthTableState(patch, panel, path, warnings, true); },
  fold: function (panel, steps) {
    return foldSanitizedPanelStates(panel, steps, function (raw, once) { return truthTableState(raw, panel, '', null, once); });
  },
  render: function (host, panel, state) {
    state = state || {};
    var columns = softwarePanelItems(panel), rows = truthTableCases(panel);
    var title = panel.title || 'Truth table';
    var html = '<div class="truth-table-scroll panel-fill-scroll" tabindex="0" role="region" aria-label="' + esc(title) + '"><table class="truth-table"><caption>' + esc(title) + ' · Authored outcomes</caption><thead><tr><th scope="col">Case</th>';
    columns.forEach(function (col) { html += '<th scope="col">' + esc(col.label || col.id) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      var active = state.active === row.id;
      html += '<tr' + (active ? ' class="truth-table-active" aria-current="true"' : '') + '><th scope="row">' + esc(row.label || row.id) + (active ? '<span class="truth-table-current">Active</span>' : '') + '</th>';
      columns.forEach(function (col) {
        var value = panelOwn(row.cells, col.id) ? row.cells[col.id] : undefined;
        html += '<td>' + (col.kind === 'icons' ? truthTableIconCell(value) : esc(truthTableCell(value))) + '</td>';
      });
      html += '</tr>';
    });
    if (!rows.length) html += '<tr><td colspan="' + (columns.length + 1) + '">No cases declared</td></tr>';
    return {html: softwarePanelShell(html + '</tbody></table></div>', state)};
  },
  layout: {attachControls: true, large: true, supporting: false, height: 10, sectionSizing: {minWidth: 300, preferredWidth: 680, maxWidth: 1200, aspectPolicy: 'content', grow: 1}},
  styles: String.raw`
.truth-table-scroll{overflow:auto;max-height:440px;min-width:0;border:1px solid color-mix(in srgb,var(--dtext) 22%,transparent);border-radius:8px}
.truth-table-scroll:focus-visible{outline:2px solid var(--dink);outline-offset:2px}
.truth-table{width:100%;border-collapse:collapse;text-align:left;font-size:12px;color:var(--dtext)}
.truth-table caption{text-align:left;padding:9px 12px;color:var(--dfaint);font-size:11px}
.truth-table th,.truth-table td{padding:10px 12px;min-width:85px;max-width:280px;overflow-wrap:anywhere;border-bottom:1px solid color-mix(in srgb,var(--dtext) 15%,transparent);vertical-align:middle}
.truth-table th{color:var(--dink);font-weight:600}.truth-table thead{background:color-mix(in srgb,var(--dtext) 5%,transparent)}
.truth-table-active{background:color-mix(in srgb,var(--dink) 10%,transparent)}.truth-table-active>th{box-shadow:inset 3px 0 var(--dink)}
.truth-table-current{display:block;font-size:10px;margin-top:4px}.truth-table-icons{display:flex;gap:12px;align-items:center;flex-wrap:wrap;min-width:160px}
.truth-table-output{display:inline-flex;gap:5px;align-items:center;font-size:11px}.truth-table-output svg{width:24px;height:24px;flex:none}
@media print{.pt-truth-table{background:#fff!important;--dtext:#222;--dink:#111;--dfaint:#555}.pt-truth-table .ptitle{color:#111!important}.truth-table-scroll{overflow:visible;max-height:none}.truth-table{font-size:10px}.truth-table th,.truth-table td{min-width:0;padding:6px;max-width:none}.truth-table-icons{min-width:0}.truth-table tr{break-inside:avoid}.truth-table-active>th{border-left:3px solid currentColor}}
`,
  authoring: {
    initialFields: true,
    transientFields: ['active', 'note'],
    origin: function (panel, key, snapshot, context) { return panelSanitizedOrigin(key, context, function (raw) { return truthTableState(raw, panel, '', null, false); }); },
    template: {
      title: 'Device power truth table',
      columns: [{id: 'source', label: 'Power source'}, {id: 'charge', label: 'Battery'}, {id: 'charging', label: 'Charging'}, {id: 'powerIcon', label: 'Power icon', kind: 'icons'}, {id: 'batteryIcon', label: 'Battery icons', kind: 'icons'}],
      cases: [
        {id: 'solar', label: 'Solar charging', cells: {source: 'Solar', charge: '60%', charging: true, powerIcon: [{icon: 'solar'}], batteryIcon: [{icon: 'battery-charging', label: 'Charging'}, {icon: 'battery', label: 'Battery available'}]}},
        {id: 'mains', label: 'Mains connected', cells: {source: 'Mains', charge: '100%', charging: false, powerIcon: [{icon: 'plug', label: 'Mains'}], batteryIcon: [{icon: 'battery-full'}]}},
        {id: 'battery', label: 'Battery operation', cells: {source: 'Battery', charge: '60%', charging: false, powerIcon: [], batteryIcon: [{icon: 'battery'}]}},
        {id: 'low', label: 'Low battery', cells: {source: 'Battery', charge: '10%', charging: false, powerIcon: [], batteryIcon: [{icon: 'battery-low'}]}}
      ],
      initial: {active: 'solar'}
    },
    setupFields: [['columns', 'rows', {cols: [{k: 'id', req: true}, {k: 'label'}, {k: 'kind', label: 'Column kind', kind: 'enum', options: ['value', 'icons']}], max: 8, wide: true}], ['cases', 'jsonArr'], ['initial', 'json']],
    patchFields: [['note', 'text']],
    expandPatchFields: function (panel) { return [['active', 'enum', truthTableCases(panel).map(function (row) { return row.id; }), {label: 'Active case', nullLabel: 'No active case', help: 'Highlight an authored case. Omitted steps inherit the previous highlight.'}], ['note', 'text']]; },
    fieldMeta: {columns: {label: 'Properties', group: 'Content', help: 'Declare column IDs and headers. Value columns hold typed properties; Icons columns hold independent shared icon lists.'}, cases: {label: 'Cases and UX icons', group: 'Content', help: 'Authored combinations, not inferred device behavior. Edit typed values, then choose each case’s output icons below.'}, note: {label: 'Explanation', nullLabel: 'Clear explanation'}},
    editor: function (context) {
      return {patchField: function (field, input) {
        if (field[0] === 'active') input.setAttribute('aria-label', 'Active case');
        if (field[0] === 'note') input.setAttribute('aria-label', 'Explanation');
      }, setupField: function (field, panel) {
        if (field[0] !== 'cases') return;
        var rows = truthTableCaseRows(panel);
        if (rows === null) return; // Preserve malformed imports in Advanced JSON.
        var columns = truthTableValueColumns(panel), cols = [{k: 'id', label: 'Case ID', req: true}, {k: 'label', label: 'Case label'}];
        columns.forEach(function (col, i) {
          cols.push({k: 'type' + i, label: (col.label || col.id) + ' type', kind: 'enum', options: ['unset', 'string', 'number', 'boolean', 'null', 'advanced']});
          cols.push({k: 'value' + i, label: col.label || col.id});
        });
        function commit(value) { return context.commit('cases', JSON.stringify(value)); }
        var wrap = context.document.createElement('div');
        var title = context.document.createElement('h4');title.textContent = 'Cases and UX icons';wrap.appendChild(title);
        wrap.appendChild(context.controls.rows('Cases', rows, {cols: cols, max: 24, wide: true}, {raw: false, commitValue: commit, collect: function (items) { return truthTableCollectCases(items, panel); }}));
        (panel.cases || []).forEach(function (row, index) {
          softwarePanelItems(panel).filter(function (col) { return col.kind === 'icons'; }).forEach(function (col) {
            var heading = context.document.createElement('h4');heading.textContent = (row.label || row.id) + ' · ' + (col.label || col.id);wrap.appendChild(heading);
            var value = panelOwn(row.cells, col.id) ? row.cells[col.id] : undefined;
            function commitIcons(icons) {
              var cases = panel.cases.slice(), cells = panelCollectionCopy(row.cells);
              cells[col.id] = icons || [];cases[index] = Object.assign({}, row, {cells: cells});return commit(cases);
            }
            if (value !== undefined && (!Array.isArray(value) || value.some(function (icon) { return !panelObject(icon); }))) {
              var warning = context.document.createElement('p');warning.textContent = 'This cell has a non-icon value. Keep it in Advanced JSON or replace it to choose icons.';wrap.appendChild(warning);
              wrap.appendChild(context.controls.action('Replace with empty icon list', function () { if (commitIcons([])) context.refresh(); }));return;
            }
            var control = context.controls.rows('Icons for ' + row.id + ' / ' + col.id, value || [], {cols: [{k: 'icon', label: 'Icon', kind: 'icon', req: true}, {k: 'label', label: 'Accessible label'}], max: 8, wide: true}, {raw: false, commitValue: commitIcons});
            control.setAttribute('data-truth-case', row.id);control.setAttribute('data-truth-column', col.id);wrap.appendChild(control);
          });
        });
        return wrap;
      }};
    },
    picker: {order: 2, name: 'Truth table', category: 'Software & data', tagline: 'Properties in, UX icons out', description: 'Compare authored device property combinations with the icons shown in your UX, and highlight a case at each story step.'},
    example: function (sample) { return sample; }
  }
});
