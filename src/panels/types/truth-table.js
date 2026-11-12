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
function truthTableIconColumns(panel) { return softwarePanelItems(panel).filter(function (col) { return col.kind === 'icons'; }); }
// An empty icon list shows its column's `empty` text: small muted "n/a" by default, "" shows nothing.
function truthTableIconCell(outputs, col) {
  if (!Array.isArray(outputs)) return '—';
  var empty = col && typeof col.empty === 'string' ? col.empty : 'n/a';
  var icons = outputs.slice(0, 8).filter(function (output) { return panelObject(output) && FlowIcons.has(output.icon); });
  var html = '<div class="truth-table-icons">';
  icons.forEach(function (output) {
    var label = typeof output.label === 'string' && output.label ? output.label : FlowIcons.registry[output.icon].label;
    html += '<span class="truth-table-output">' + FlowIcons.render(output.icon, {label: label}) + '<span aria-hidden="true">' + esc(label) + '</span></span>';
  });
  return html + (icons.length ? '' : outputs.length ? '—' : empty ? '<span class="truth-table-empty">' + esc(empty) + '</span>' : '') + '</div>';
}
// Active case choices show each case's label, or its ID when unlabeled. A shown text that matches any other
// visible choice (another case, the inherit/default choice or No active case) gets its ID, or "(case ID)".
function truthTableCaseChoices(panel, reserved) {
  var rows = truthTableCases(panel), texts = rows.map(function (row) { return typeof row.label === 'string' && row.label.trim() ? row.label : String(row.id); });
  var visible = (reserved || []).concat(texts);
  return rows.map(function (row, i) {
    var text = texts[i], labeled = typeof row.label === 'string' && row.label.trim();
    var clash = visible.filter(function (other) { return other === text; }).length > 1;
    return [row.id, !clash ? text : labeled ? text + ' (' + row.id + ')' : text + ' (case ID)'];
  });
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
      if (col.kind === 'icons' && col.empty !== undefined && typeof col.empty !== 'string') warnings.push(at + '.empty: expected text — showing n/a');
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
        html += '<td>' + (col.kind === 'icons' ? truthTableIconCell(value, col) : esc(truthTableCell(value))) + '</td>';
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
.truth-table-empty{font-size:10px;color:var(--dfaint)}
@media print{.pt-truth-table{background:#fff!important;--dtext:#222;--dink:#111;--dfaint:#555}.pt-truth-table .ptitle{color:#111!important}.truth-table-scroll{overflow:visible;max-height:none}.truth-table{font-size:10px}.truth-table th,.truth-table td{min-width:0;padding:6px;max-width:none}.truth-table-icons{min-width:0}.truth-table tr{break-inside:avoid}.truth-table-active>th{border-left:3px solid currentColor}}
`,
  // Inspect case cards: two-column ID/label row, full-width property pairs and icon lists.
  editorStyles: String.raw`
.rowline.rowcard.truth-case{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 8px;padding:8px}
.rowline.rowcard>.rowcell.truth-column-empty[hidden]{display:none}
.truth-case-head,.truth-property,.truth-case-icons,.rowline.rowcard>.rowcell.truth-column-kind{grid-column:1/-1;min-width:0}
.truth-case-head{display:flex;align-items:center;gap:8px}
.truth-case-title{flex:1;min-width:0;font:600 12px/1.4 'IBM Plex Sans',sans-serif;color:var(--ink);overflow-wrap:anywhere}
.truth-case-head>.rowcardacts{flex:none}
.truth-property{display:flex;flex-direction:column;gap:2px}
.truth-property-controls{display:flex;gap:6px;min-width:0}
.truth-case .truth-property-controls>select.fctl{flex:0 0 108px;width:108px}
.truth-case .truth-property-controls>input.fctl{flex:1 1 0;width:0;min-width:0}
.truth-case-icons{display:flex;flex-direction:column;gap:4px;margin-top:2px;padding-top:6px;border-top:1px solid var(--line)}
.truth-case-icons>.fnote{margin:0;overflow-wrap:anywhere}
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
    setupFields: [['columns', 'rows', {cols: [{k: 'id', label: 'Column ID', req: true}, {k: 'label', label: 'Header'}, {k: 'kind', label: 'Column kind', kind: 'enum', options: ['value', 'icons'], unsetLabel: 'value (default)'}, {k: 'empty', label: 'Empty cell text'}], max: 8, wide: true}], ['cases', 'jsonArr'], ['initial', 'json']],
    patchFields: [['note', 'text']],
    expandPatchFields: function (panel) { return [['active', 'enum', truthTableCases(panel).map(function (row) { return row.id; }), {label: 'Active case', nullLabel: 'No active case', assignment: false, help: 'Highlight an authored case. Omitted steps inherit the previous highlight.'}], ['note', 'text']]; },
    fieldMeta: {columns: {label: 'Properties', group: 'Content', help: 'Declare column IDs and headers. Value columns hold typed properties; Icons columns hold independent shared icon lists. An empty icon cell shows its column’s Empty cell text, or a small n/a when blank.'}, cases: {label: 'Cases and UX icons', group: 'Content', help: 'Authored combinations, not inferred device behavior. Each case card holds its typed property values and its output icons.'}, note: {label: 'Explanation', nullLabel: 'Clear explanation'}},
    editor: function (context) {
      return {patchField: function (field, input) {
        if (field[0] === 'note') input.setAttribute('aria-label', 'Explanation');
      }, patchControl: function (field, options) {
        // One Active case dropdown (assignment: false): inherit/panel default, each case by label, or No active case (null).
        if (field[0] !== 'active') return null;
        var meta = panelFieldPresentation(options.panel, field, options.initial ? 'initial' : 'step');
        var choices = [[undefined, meta.unsetLabel]].concat(truthTableCaseChoices(options.panel, [meta.unsetLabel, meta.nullLabel]), [[null, meta.nullLabel]]);
        var current = options.assigned ? options.value : undefined, selected = -1;
        choices.forEach(function (choice, i) { if (choice[0] === current) selected = i; });
        if (selected < 0) { choices.push([current, (typeof current === 'string' ? current : JSON.stringify(current)) + ' (unknown case)']); selected = choices.length - 1; }
        var input = context.document.createElement('select');input.className = 'fctl';input.setAttribute('aria-label', 'Active case');
        choices.forEach(function (choice) {
          var option = context.document.createElement('option');option.value = typeof choice[0] === 'string' ? choice[0] : '';option.textContent = choice[1];input.appendChild(option);
        });
        input.selectedIndex = selected;
        context.listen(input, 'change', function () { if (!options.commit(choices[input.selectedIndex][0])) input.selectedIndex = selected; });
        return input;
      }, setupField: function (field, panel) {
        var doc = context.document;
        function node(tag, className, text) { var el = doc.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
        // Same shared rows control as other setup fields; the kind cell spans the card so "value (default)" stays readable,
        // and only icons columns show their Empty cell text (blank = the n/a default).
        if (field[0] === 'columns') return context.controls.block('Properties', context.controls.rows('columns', panel.columns, field[2], {cell: function (info) {
          if (info.column.k === 'kind') info.cell.classList.add('truth-column-kind');
          if (info.column.k === 'empty') {
            var icons = !!info.base && info.base.kind === 'icons';
            info.cell.classList.add('truth-column-empty');info.cell.hidden = !icons;
            if (icons) { info.input.setAttribute('aria-label', String(info.base.label || info.base.id) + ' empty cell text');info.input.placeholder = 'n/a'; }
          }
          return false;
        }}));
        if (field[0] !== 'cases') return;
        var rows = truthTableCaseRows(panel);
        if (rows === null) return; // Preserve malformed imports in Advanced JSON.
        var columns = truthTableValueColumns(panel), iconColumns = truthTableIconColumns(panel), cols = [{k: 'id', label: 'Case ID', req: true}, {k: 'label', label: 'Case label'}];
        columns.forEach(function (col, i) {
          cols.push({k: 'type' + i, label: (col.label || col.id) + ' type', kind: 'enum', options: ['unset', 'string', 'number', 'boolean', 'null', 'advanced']});
          cols.push({k: 'value' + i, label: col.label || col.id});
        });
        function commit(value) { return context.commit('cases', JSON.stringify(value)); }
        function iconEditor(row, index, col) {
          var section = node('div', 'truth-case-icons');
          section.setAttribute('data-truth-case', row.id);section.setAttribute('data-truth-column', col.id);
          section.appendChild(node('span', 'rowk', col.label || col.id));
          var value = panelOwn(row.cells, col.id) ? row.cells[col.id] : undefined;
          function commitIcons(icons) {
            var cases = panel.cases.slice(), cells = panelCollectionCopy(row.cells);
            cells[col.id] = icons || [];cases[index] = Object.assign({}, row, {cells: cells});return commit(cases);
          }
          if (value !== undefined && (!Array.isArray(value) || value.some(function (icon) { return !panelObject(icon); }))) {
            section.appendChild(node('p', 'fnote', 'This cell has a non-icon value. Keep it in Advanced JSON or replace it to choose icons.'));
            section.appendChild(context.controls.action('Replace with empty icon list', function () { if (commitIcons([])) context.refresh(); }));return section;
          }
          section.appendChild(context.controls.rows('Icons for ' + row.id + ' / ' + col.id, value || [], {cols: [{k: 'icon', label: 'Icon', kind: 'icon', req: true}, {k: 'label', label: 'Accessible label'}], max: 8, wide: true}, {raw: false, commitValue: commitIcons}));
          return section;
        }
        // One card per case: case actions in its header, each value column's type and value on one row, then that case's icon lists.
        function caseCard(info) {
          var line = info.line, ref = info.ref, index = info.base ? info.base._sourceIndex : -1, row = index >= 0 ? panel.cases[index] : null;
          var title = !row ? 'New case' : typeof row.label === 'string' && row.label ? row.label : typeof row.id === 'string' && row.id ? row.id : 'Case ' + (index + 1);
          var head = node('div', 'truth-case-head');head.appendChild(node('span', 'truth-case-title', title));
          head.appendChild(line.querySelector(':scope > .rowcardacts'));line.insertBefore(head, line.firstChild);
          line.classList.add('truth-case');line.setAttribute('role', 'group');line.setAttribute('aria-label', title + ' case');
          columns.forEach(function (col, i) {
            var type = ref.inputs['type' + i], value = ref.inputs['value' + i], typeCell = type.closest('.rowcell'), valueCell = value.closest('.rowcell');
            var pair = node('div', 'truth-property'), controls = node('div', 'truth-property-controls');
            pair.setAttribute('data-truth-property', col.id);pair.appendChild(node('span', 'rowk', col.label || col.id));
            controls.appendChild(type);controls.appendChild(value);pair.appendChild(controls);
            line.replaceChild(pair, typeCell);line.removeChild(valueCell);
          });
          if (!row) return line; // A new case gets icon lists once it is saved.
          line.setAttribute('data-truth-case', row.id);
          iconColumns.forEach(function (col) { line.appendChild(iconEditor(row, index, col)); });
          return line;
        }
        var wrap = node('div', 'truth-cases');
        wrap.appendChild(node('h4', '', 'Cases and UX icons'));
        wrap.appendChild(context.controls.rows('Cases', rows, {cols: cols, max: 24, wide: true}, {raw: false, commitValue: commit, collect: function (items) { return truthTableCollectCases(items, panel); }, wrapRow: caseCard}));
        return wrap;
      }};
    },
    picker: {order: 2, name: 'Truth table', category: 'Software & data', tagline: 'Properties in, UX icons out', description: 'Compare authored device property combinations with the icons shown in your UX, and highlight a case at each story step.'},
    example: function (sample) { return sample; }
  }
});
