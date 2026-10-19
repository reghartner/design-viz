/* Value matrix: a small labelled table of authored numbers coloured by value,
   with optional significance marks and row/column/cell emphasis. Nothing is
   computed from data files; every number, mark and scale bound is authored. */
var GRID_MAX_AXIS = 12;
var GRID_MARKS = ['*', '**', '***', 'ns', ''];
/* Row and column ids form cell keys "<row>.<col>", so they carry no dots and
   start with a letter or digit (which also keeps `__proto__` out). */
function gridSafeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id);
}
function gridAxis(panel, key) {
  return panelCollectionItems(panel, key, GRID_MAX_AXIS).filter(function (item) {
    return gridSafeId(item.id);
  }).map(function (item) {
    return { id: item.id, label: typeof item.label === 'string' && item.label.trim() ? item.label : item.id };
  });
}
function gridKeys(panel) {
  var keys = [];
  gridAxis(panel, 'rows').forEach(function (row) {
    gridAxis(panel, 'cols').forEach(function (col) { keys.push(row.id + '.' + col.id); });
  });
  return keys;
}
function gridDecimals(panel) {
  return Number.isInteger(panel.decimals) && panel.decimals >= 0 && panel.decimals <= 4 ? panel.decimals : 2;
}
function gridUnit(panel) {
  return typeof panel.unit === 'string' ? panel.unit.trim() : '';
}
function gridAxisWarnings(panel, path, warnings, key) {
  var seen = Object.create(null), valid = 0;
  if (!Array.isArray(panel[key]) || !panel[key].length || panel[key].length > GRID_MAX_AXIS)
    warnings.push(path + '.' + key + ': declare 1–' + GRID_MAX_AXIS + ' entries [{id,label}] with unique ids');
  (Array.isArray(panel[key]) ? panel[key] : []).forEach(function (item, i) {
    var at = path + '.' + key + '[' + i + ']';
    if (i >= GRID_MAX_AXIS) return;
    if (!panelObject(item) || typeof item.id !== 'string' || !item.id) {
      warnings.push(at + '.id: needs a non-empty string — entry skipped');
      return;
    }
    if (!gridSafeId(item.id)) {
      warnings.push(at + '.id: use letters, digits, "-" or "_" starting with a letter or digit (no dots) — entry skipped');
      return;
    }
    if (seen[item.id]) {
      warnings.push(at + '.id: duplicate id "' + item.id + '" — later entry skipped');
      return;
    }
    seen[item.id] = true;
    valid++;
    if (item.label !== undefined && typeof item.label !== 'string') warnings.push(at + '.label: expected text — using the id');
  });
  if (Array.isArray(panel[key]) && panel[key].length && !valid)
    warnings.push(path + '.' + key + ': no usable entries — the panel renders empty');
}
function gridDeclarationWarnings(panel, path, warnings) {
  gridAxisWarnings(panel, path, warnings, 'rows');
  gridAxisWarnings(panel, path, warnings, 'cols');
  if (panel.scale !== undefined) {
    var scale = panel.scale, sp = path + '.scale';
    if (!panelObject(scale)) warnings.push(sp + ': expected {min?,max?,mid?,kind?} — using an automatic scale');
    else {
      ['min', 'max', 'mid'].forEach(function (key) {
        if (scale[key] !== undefined && !isFiniteNum(scale[key]))
          warnings.push(sp + '.' + key + ': expected a finite number — ignored');
      });
      if (isFiniteNum(scale.min) && isFiniteNum(scale.max) && !(scale.min < scale.max))
        warnings.push(sp + ': min must be less than max — using an automatic scale');
      if (scale.kind !== undefined && scale.kind !== 'sequential' && scale.kind !== 'diverging')
        warnings.push(sp + '.kind: expected sequential or diverging — using sequential');
      if (isFiniteNum(scale.mid) && isFiniteNum(scale.min) && isFiniteNum(scale.max) && !(scale.mid > scale.min && scale.mid < scale.max))
        warnings.push(sp + '.mid: must lie strictly between min and max — using the midpoint');
      Object.keys(scale).forEach(function (key) {
        if (['min', 'max', 'mid', 'kind'].indexOf(key) < 0) warnings.push(sp + '.' + key + ': unknown scale field — ignored');
      });
    }
  }
  if (panel.decimals !== undefined && gridDecimals(panel) !== panel.decimals)
    warnings.push(path + '.decimals: expected a whole number 0–4 — using 2');
  if (panel.unit !== undefined && typeof panel.unit !== 'string')
    warnings.push(path + '.unit: expected text — ignored');
  gridPatchWarnings(panel.initial, path + '.initial', panel, warnings);
}
function gridKeyedWarnings(value, path, keys, warnings, what, validValue) {
  if (value === null) return;
  if (!panelObject(value)) {
    warnings.push(path + ': expected an object keyed "<rowId>.<colId>" (or null to clear every ' + what + ') — ignored');
    return;
  }
  Object.keys(value).forEach(function (key) {
    var at = path + '.' + key;
    if (keys.indexOf(key) < 0) warnings.push(at + ': unknown cell key — ignored');
    else if (value[key] !== null && !validValue(value[key]))
      warnings.push(at + ': expected ' + (what === 'value' ? 'a finite number' : 'one of "*", "**", "***", "ns" or ""') + ' or null — ignored');
  });
}
function gridHighlightWarnings(value, path, panel, warnings) {
  if (value === null) return;
  if (!panelObject(value)) {
    warnings.push(path + ': expected {row?,col?,cell?} or null — ignored');
    return;
  }
  var rows = gridAxis(panel, 'rows').map(function (row) { return row.id; }),
    cols = gridAxis(panel, 'cols').map(function (col) { return col.id; }), keys = gridKeys(panel);
  Object.keys(value).forEach(function (key) {
    var at = path + '.' + key, v = value[key];
    if (key === 'row') { if (v !== null && rows.indexOf(v) < 0) warnings.push(at + ': unknown row id — ignored'); }
    else if (key === 'col') { if (v !== null && cols.indexOf(v) < 0) warnings.push(at + ': unknown column id — ignored'); }
    else if (key === 'cell') { if (v !== null && keys.indexOf(v) < 0) warnings.push(at + ': unknown cell key — ignored'); }
    else warnings.push(at + ': unknown highlight field — ignored');
  });
}
function gridPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path, panel, warnings) {
    var keys = gridKeys(panel);
    Object.keys(state).forEach(function (key) {
      var value = state[key], at = path + '.' + key;
      if (key === 'enterOnce') return;
      if (key === 'cells') gridKeyedWarnings(value, at, keys, warnings, 'value', isFiniteNum);
      else if (key === 'marks') gridKeyedWarnings(value, at, keys, warnings, 'mark', function (v) { return GRID_MARKS.indexOf(v) >= 0; });
      else if (key === 'highlight') gridHighlightWarnings(value, at, panel, warnings);
      else if (key === 'note') { if (value !== null && typeof value !== 'string') warnings.push(at + ': expected text or null — ignored'); }
      else warnings.push(at + ': unknown field — ignored');
    });
  });
}
/* Pure sparse merge shared by `cells` and `marks`: null clears everything,
   a null entry forgets one key, invalid or unknown entries are skipped. */
function gridMergeKeyed(base, patch, keys, validValue) {
  var out = {};
  if (patch === null) return out;
  Object.keys(panelObject(base) ? base : {}).forEach(function (key) { out[key] = base[key]; });
  if (!panelObject(patch)) return out;
  keys.forEach(function (key) {
    if (!panelOwn(patch, key)) return;
    var value = patch[key];
    if (value === null) delete out[key];
    else if (validValue(value)) out[key] = value;
  });
  return out;
}
function gridMark(value) { return GRID_MARKS.indexOf(value) >= 0; }
function gridCleanHighlight(raw, panel) {
  if (raw === null) return null;
  if (!panelObject(raw)) return undefined;
  var out = {}, rows = gridAxis(panel, 'rows').map(function (row) { return row.id; }),
    cols = gridAxis(panel, 'cols').map(function (col) { return col.id; }), keys = gridKeys(panel);
  if (panelOwn(raw, 'row') && (raw.row === null || rows.indexOf(raw.row) >= 0)) out.row = raw.row;
  if (panelOwn(raw, 'col') && (raw.col === null || cols.indexOf(raw.col) >= 0)) out.col = raw.col;
  if (panelOwn(raw, 'cell') && (raw.cell === null || keys.indexOf(raw.cell) >= 0)) out.cell = raw.cell;
  return out;
}
function gridCleanState(raw, panel, allowOnce) {
  var out = {};
  if (!panelObject(raw)) return out;
  if (panelOwn(raw, 'highlight')) {
    var highlight = gridCleanHighlight(raw.highlight, panel);
    if (highlight !== undefined) out.highlight = highlight;
  }
  if (panelOwn(raw, 'note') && (raw.note === null || typeof raw.note === 'string')) out.note = raw.note;
  if (allowOnce && panelObject(raw.enterOnce)) out.enterOnce = gridCleanState(raw.enterOnce, panel, false);
  return out;
}
function gridFold(panel, steps) {
  var keys = gridKeys(panel);
  var states = foldSanitizedPanelStates(panel, steps, function (raw, once) { return gridCleanState(raw, panel, once); });
  var initial = panelObject(panel.initial) ? panel.initial : {};
  var cells = gridMergeKeyed({}, panelOwn(initial, 'cells') ? initial.cells : undefined, keys, isFiniteNum);
  var marks = gridMergeKeyed({}, panelOwn(initial, 'marks') ? initial.marks : undefined, keys, gridMark);
  function attach(state, carriedCells, carriedMarks, once) {
    state.cells = once && panelOwn(once, 'cells') ? gridMergeKeyed(carriedCells, once.cells, keys, isFiniteNum) : carriedCells;
    state.marks = once && panelOwn(once, 'marks') ? gridMergeKeyed(carriedMarks, once.marks, keys, gridMark) : carriedMarks;
  }
  steps.forEach(function (step, i) {
    var source = stepPanelPatch(step), patch = source && panelOwn(source, panel.id) ? source[panel.id] : null;
    if (!panelObject(patch)) patch = {};
    if (panelOwn(patch, 'cells')) cells = gridMergeKeyed(cells, patch.cells, keys, isFiniteNum);
    if (panelOwn(patch, 'marks')) marks = gridMergeKeyed(marks, patch.marks, keys, gridMark);
    attach(states[i], cells, marks, panelObject(patch.enterOnce) ? patch.enterOnce : null);
  });
  if (!steps.length) attach(states[0], cells, marks, null);
  return states;
}
/* Resolves the colour scale for the current cells. Authored bounds win;
   missing bounds come from the data, and no numbers at all means 0–1. */
function gridScale(panel, values) {
  var scale = panelObject(panel.scale) ? panel.scale : {};
  var kind = scale.kind === 'diverging' ? 'diverging' : 'sequential';
  var hasMin = isFiniteNum(scale.min), hasMax = isFiniteNum(scale.max);
  if (hasMin && hasMax && !(scale.min < scale.max)) hasMin = hasMax = false;
  var dataMin = values.length ? Math.min.apply(null, values) : null, dataMax = values.length ? Math.max.apply(null, values) : null;
  var min = hasMin ? scale.min : dataMin !== null ? (hasMax ? Math.min(dataMin, scale.max) : dataMin) : (hasMax ? Math.min(0, scale.max) : 0);
  var max = hasMax ? scale.max : dataMax !== null ? Math.max(dataMax, min) : Math.max(1, min);
  if (!isFiniteNum(min) || !isFiniteNum(max)) { min = 0; max = 1; }
  var mid = isFiniteNum(scale.mid) && scale.mid > min && scale.mid < max ? scale.mid : (min + max) / 2;
  return { kind: kind, min: min, max: max, mid: mid, auto: !(hasMin && hasMax) };
}
function gridIntensity(value, scale) {
  var t;
  if (scale.kind === 'diverging') {
    if (value <= scale.mid) t = scale.mid > scale.min ? 0.5 * (value - scale.min) / (scale.mid - scale.min) : 0.5;
    else t = scale.max > scale.mid ? 0.5 + 0.5 * (value - scale.mid) / (scale.max - scale.mid) : 0.5;
  } else t = scale.max > scale.min ? (value - scale.min) / (scale.max - scale.min) : 0.5;
  return isFiniteNum(t) ? clamp(t, 0, 1) : 0.5;
}
function gridFormat(value, decimals) {
  return isFiniteNum(value) ? value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';
}
/* Each cell carries its value, display text, mark, 0–1 intensity, the shade
   side/depth used for colouring and its highlight flags. Intensity is never NaN. */
function gridModel(panel, state) {
  state = panelObject(state) ? state : {};
  var rows = gridAxis(panel, 'rows'), cols = gridAxis(panel, 'cols');
  var cells = panelObject(state.cells) ? state.cells : {}, marks = panelObject(state.marks) ? state.marks : {};
  var highlight = panelObject(state.highlight) ? state.highlight : {};
  var decimals = gridDecimals(panel), unit = gridUnit(panel), values = [];
  rows.forEach(function (row) {
    cols.forEach(function (col) {
      var v = panelOwn(cells, row.id + '.' + col.id) ? cells[row.id + '.' + col.id] : null;
      if (isFiniteNum(v)) values.push(v);
    });
  });
  var scale = gridScale(panel, values);
  var table = rows.map(function (row) {
    var rowHighlight = highlight.row === row.id;
    return {
      id: row.id, label: row.label, highlight: rowHighlight,
      cells: cols.map(function (col) {
        var key = row.id + '.' + col.id, raw = panelOwn(cells, key) ? cells[key] : null;
        var value = isFiniteNum(raw) ? raw : null, known = value !== null;
        var intensity = known ? gridIntensity(value, scale) : 0;
        var side = known && scale.kind === 'diverging' && intensity < 0.5 ? 'low' : 'high';
        var depth = known ? (scale.kind === 'diverging' ? Math.abs(intensity - 0.5) * 2 : intensity) : 0;
        var mark = panelOwn(marks, key) && gridMark(marks[key]) ? marks[key] : '';
        return {
          key: key, row: row.id, col: col.id, value: value, known: known, text: gridFormat(value, decimals), mark: mark,
          intensity: known ? intensity : 0, side: side, depth: isFiniteNum(depth) ? clamp(depth, 0, 1) : 0,
          highlight: highlight.cell === key, rowHighlight: rowHighlight, colHighlight: highlight.col === col.id,
        };
      }),
    };
  });
  return {
    rows: table, cols: cols.map(function (col) { return { id: col.id, label: col.label, highlight: highlight.col === col.id }; }),
    scale: scale, decimals: decimals, unit: unit, count: values.length,
  };
}
function gridHTML(panel, state) {
  var model = gridModel(panel, state), unit = model.unit ? ' ' + model.unit : '';
  var h = '<div class="grid-wrap panel-fill-scroll" tabindex="0" role="region" aria-label="' + esc(panel.title || 'Value matrix') + '">';
  if (!model.rows.length || !model.cols.length) h += '<p class="grid-empty">Declare 1–' + GRID_MAX_AXIS + ' rows and columns to show values.</p>';
  else {
    h += '<table class="grid-table grid-' + model.scale.kind + '" aria-label="' + esc((panel.title || 'Value matrix') + ': ' +
      model.rows.length + ' rows by ' + model.cols.length + ' columns, ' + model.scale.kind + ' scale ' +
      gridFormat(model.scale.min, model.decimals) + ' to ' + gridFormat(model.scale.max, model.decimals) + unit) + '">';
    h += '<thead><tr><th scope="col" class="grid-corner"></th>';
    model.cols.forEach(function (col) {
      h += '<th scope="col" class="grid-colhead' + (col.highlight ? ' grid-hl' : '') + '" title="' + esc(col.label) + '">' + esc(col.label) + '</th>';
    });
    h += '</tr></thead><tbody>';
    model.rows.forEach(function (row) {
      h += '<tr class="grid-row' + (row.highlight ? ' grid-rowhl' : '') + '"><th scope="row" class="grid-rowhead' + (row.highlight ? ' grid-hl' : '') +
        '" title="' + esc(row.label) + '">' + esc(row.label) + '</th>';
      row.cells.forEach(function (cell, c) {
        var classes = 'grid-cell grid-' + cell.side + (cell.known ? '' : ' grid-unknown') + (cell.depth > 0.55 ? ' grid-deep' : '') +
          (cell.highlight ? ' grid-hl-cell' : '') + (cell.rowHighlight ? ' grid-hl-row' : '') + (cell.colHighlight ? ' grid-hl-col' : '');
        var title = row.label + ' × ' + model.cols[c].label + ': ' + (cell.known ? cell.text + unit : 'no value') +
          (cell.mark ? ' (' + cell.mark + ')' : '');
        h += '<td class="' + classes + '" style="--grid-d:' + cell.depth.toFixed(3) + '" title="' + esc(title) + '">' +
          '<span class="grid-value">' + esc(cell.text) + '</span>' +
          (cell.mark ? '<sup class="grid-mark' + (cell.mark === 'ns' ? ' grid-mark-ns' : '') + '">' + esc(cell.mark) + '</sup>' : '') + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    h += '<div class="grid-key" aria-hidden="true"><span>' + esc(gridFormat(model.scale.min, model.decimals) + unit) + '</span>' +
      '<span class="grid-ramp grid-ramp-' + model.scale.kind + '"></span><span>' + esc(gridFormat(model.scale.max, model.decimals) + unit) + '</span>' +
      (model.scale.auto ? '<em>auto</em>' : '') + '</div>';
  }
  return softwarePanelShell(h + '</div>', state || {});
}
PanelRegistry.define('grid', {
  label: 'Value matrix', since: '0.2.0', order: 45,
  validateDeclaration: gridDeclarationWarnings, validatePatch: gridPatchWarnings, fold: gridFold,
  render: function (host, panel, state) { return { html: gridHTML(panel, state) }; },
  presentation: { ambientInitial: true },
  layout: { sectionSizing: { minWidth: 240, preferredWidth: 380, maxWidth: 700, aspectPolicy: 'content', grow: 1 } },
  styles: String.raw`
.grid-wrap{font-size:11px;color:var(--dtext);min-width:0;overflow:auto;max-height:420px}
.grid-wrap:focus-visible{outline:2px solid var(--dink);outline-offset:2px}
.grid-empty{margin:0;color:var(--dfaint)}
.grid-table{--grid-low:color-mix(in srgb,var(--dtext) 7%,transparent);--grid-mid:color-mix(in srgb,var(--dtext) 7%,transparent);--grid-high:#2f6fd6;--grid-neg:#d4704f;border-collapse:separate;border-spacing:2px;width:100%;table-layout:fixed}
.grid-table th{font:500 10px 'IBM Plex Mono',monospace;color:var(--dfaint);padding:3px 4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grid-table .grid-colhead{vertical-align:bottom}.grid-table .grid-rowhead{text-align:right;width:26%}
.grid-table .grid-corner{width:26%}
.grid-table th.grid-hl{color:var(--dink);font-weight:700}
.grid-cell{position:relative;padding:5px 4px;text-align:center;border-radius:4px;font:600 11px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:var(--dink);background:color-mix(in srgb,var(--grid-high) calc(var(--grid-d)*100%),var(--grid-mid));transition:background-color .4s ease}
.grid-cell.grid-low{background:color-mix(in srgb,var(--grid-neg) calc(var(--grid-d)*100%),var(--grid-mid))}
.grid-cell.grid-deep{color:#fff}
.grid-cell.grid-unknown{background:transparent;color:var(--dfaint);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dtext) 14%,transparent)}
.grid-mark{font-size:9px;margin-left:1px;vertical-align:top;line-height:1}.grid-mark-ns{font-weight:400;opacity:.8}
.grid-cell.grid-hl-row,.grid-cell.grid-hl-col{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--dink) 55%,transparent)}
.grid-cell.grid-hl-cell{box-shadow:inset 0 0 0 2px var(--dink),0 0 0 1px var(--dink)}
.grid-key{display:flex;align-items:center;gap:6px;margin-top:6px;font:500 9px 'IBM Plex Mono',monospace;color:var(--dfaint)}
.grid-key em{font-style:normal;letter-spacing:.5px;text-transform:uppercase;font-size:8px}
.grid-ramp{display:inline-block;flex:0 0 72px;height:7px;border-radius:4px;background:linear-gradient(90deg,var(--grid-mid),var(--grid-high))}
.grid-ramp-diverging{background:linear-gradient(90deg,var(--grid-neg),var(--grid-mid),var(--grid-high))}
@media (prefers-reduced-motion:reduce){.grid-cell{transition:none}}
@media print{.grid-cell,.grid-ramp{-webkit-print-color-adjust:exact;print-color-adjust:exact}.grid-wrap{max-height:none;overflow:visible}}

/* Content hierarchy and intrinsic fit; authored state and saved geometry stay authoritative. */
.grid-table{border-spacing:4px}.grid-cell{padding:9px 5px;border-radius:6px}.grid-table th{color:var(--dtext);padding:6px 4px}.grid-key{gap:8px;margin-top:10px;flex-wrap:wrap}.grid-wrap{scrollbar-width:thin}
`,
  authoring: {
    initialFields: true,
    template: {
      title: 'Values by group', decimals: 2,
      rows: [{ id: 'groupA', label: 'Group A' }, { id: 'groupB', label: 'Group B' }],
      cols: [{ id: 'period1', label: 'Period 1' }, { id: 'period2', label: 'Period 2' }],
      scale: { min: -2, max: 2, kind: 'diverging' },
      initial: { cells: { 'groupA.period1': 1.4, 'groupA.period2': -0.6, 'groupB.period1': 0.1, 'groupB.period2': 0.2 } },
    },
    setupFields: [
      ['rows', 'rows', { max: GRID_MAX_AXIS, cols: [{ k: 'id', req: true }, { k: 'label' }] }],
      ['cols', 'rows', { max: GRID_MAX_AXIS, cols: [{ k: 'id', req: true }, { k: 'label' }] }],
      ['scale', 'json'], ['decimals', 'num', { min: 0, max: 4 }], ['unit', 'text'], ['initial', 'json'],
    ],
    patchFields: [['cells', 'json', { nullable: true }], ['marks', 'json', { nullable: true }], ['highlight', 'json', { nullable: true }], ['note', 'text']],
    fieldMeta: {
      rows: { label: 'Rows', help: 'Declare 1–12 rows with unique ids (letters, digits, - or _; no dots).' },
      cols: { label: 'Columns', help: 'Declare 1–12 columns with unique ids (letters, digits, - or _; no dots).' },
      scale: { label: 'Colour scale', help: '{"min","max","kind","mid"}. Kind is sequential (default) or diverging; min/max default to the current values; mid defaults to the midpoint.' },
      decimals: { label: 'Decimals', help: 'Digits after the decimal point, 0–4. Default 2.' },
      unit: { label: 'Unit suffix', help: 'Optional text appended to values in tooltips and the key, e.g. points or %.' },
      cells: { label: 'Cell values', help: 'An object keyed "<rowId>.<colId>", e.g. {"groupA.period1": 1.4}. Keys merge into the carried values; null forgets a cell; null for the whole field clears every value.', nullLabel: 'Clear every value' },
      marks: { label: 'Significance marks', help: 'An object keyed like cells with "*", "**", "***", "ns" or "". Merges like cells.', nullLabel: 'Clear every mark' },
      highlight: { label: 'Highlight', help: '{"row","col","cell"}: outline one row, one column and/or one cell ("<rowId>.<colId>").', nullLabel: 'No highlight' },
      note: { label: 'Explanation' },
    },
    picker: {
      order: 45, name: 'Value matrix', category: 'Data & charts', tagline: 'A k × k table coloured by value',
      description: 'Compare authored numbers across two labelled axes as a small heatmap with significance marks and row, column or cell emphasis.',
    },
    example: function (sample) {
      var panel = sample.panel, state = sample.state;
      panel.title = 'Values over time';
      panel.unit = 'points';
      panel.rows = [{ id: 'first', label: 'First' }, { id: 'middle', label: 'Middle' }, { id: 'last', label: 'Last' }];
      panel.cols = [{ id: 'a', label: 'Group A' }, { id: 'b', label: 'Group B' }, { id: 'c', label: 'Group C' }];
      panel.scale = { min: -3, max: 3, kind: 'diverging' };
      state.cells = {
        'first.a': 0.4, 'first.b': -1.2, 'first.c': 2.6,
        'middle.a': 1.1, 'middle.b': -0.3, 'middle.c': 1.8,
        'last.a': 2.9, 'last.b': -2.4,
      };
      state.marks = { 'first.c': '***', 'last.a': '**', 'last.b': '*', 'middle.b': 'ns' };
      state.highlight = { cell: 'last.a' };
      state.note = 'Illustrative values. Last × Group C is not yet measured.';
      panel.initial = builderClone(state);
      return sample;
    },
  },
});
