/* buffer validation and pure state helpers. */
function bufferCellWarnings(obj, path, decl, warnings) {
  if (!obj || typeof obj !== 'object') return;
  var n =
    decl &&
    typeof decl.segments === 'number' &&
    isFinite(decl.segments) &&
    decl.segments >= 2 &&
    decl.segments <= 48
      ? Math.round(decl.segments)
      : 12;
  if (obj.cells != null) {
    if (!Array.isArray(obj.cells)) {
      warnings.push(path + '.cells: must be an array of state tokens — ignored');
    } else
      obj.cells.forEach(function (c, ci) {
        if (BUFFER_STATES.indexOf(c) < 0)
          warnings.push(
            path +
              '.cells[' +
              ci +
              ']: unknown state "' +
              c +
              '" — rendered empty (valid: ' +
              BUFFER_STATES.join(' ') +
              ')'
          );
      });
  }
  if (
    obj.head != null &&
    !(typeof obj.head === 'number' && isFinite(obj.head) && obj.head >= 0 && obj.head < n)
  )
    warnings.push(path + '.head: expected an index 0–' + (n - 1) + ' — marker hidden');
  if (obj.mark != null) {
    if (!Array.isArray(obj.mark)) {
      warnings.push(path + '.mark: must be an array of [i0, i1, "state"] paints — ignored');
    } else
      obj.mark.forEach(function (op, oi) {
        var okShape =
          Array.isArray(op) &&
          op.length >= 3 &&
          typeof op[0] === 'number' &&
          isFinite(op[0]) &&
          typeof op[1] === 'number' &&
          isFinite(op[1]);
        if (!okShape)
          warnings.push(path + '.mark[' + oi + ']: expected [i0, i1, "state"] — paint skipped');
        else if (BUFFER_STATES.indexOf(op[2]) < 0)
          warnings.push(
            path +
              '.mark[' +
              oi +
              ']: unknown state "' +
              op[2] +
              '" — paint skipped (valid: ' +
              BUFFER_STATES.join(' ') +
              ')'
          );
      });
  }
}

/* signal per-link status checks shared by initial and step patches: each
   key is a link id whose value is {state, bars, note} */

PanelRegistry.extend('buffer', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (p.segments != null) {
      if (!isFiniteNum(p.segments))
        warnings.push(PP + '.segments: expected a number 2–48 — using 12');
      else if (p.segments < 2 || p.segments > 48)
        warnings.push(PP + '.segments: out of range — clamped to 2–48');
    }
    bufferCellWarnings(p.initial, PP + '.initial', p, warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    bufferCellWarnings(patch, path, panel, warnings);
  },
});

/* buffer panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
var BUFFER_CELL_STATES = ['empty', 'buffered', 'protected', 'uploading', 'uploaded', 'dropped'];
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
    typeof state.head === 'number' && isFinite(state.head) && state.head >= 0 && state.head < n
      ? Math.round(state.head)
      : null;
  var counts = {};
  cells.forEach(function (c) {
    counts[c] = (counts[c] || 0) + 1;
  });
  var parts = [];
  BUFFER_CELL_STATES.forEach(function (sname) {
    if (sname !== 'empty' && counts[sname]) parts.push(counts[sname] + ' ' + sname);
  });
  return {
    n: n,
    cells: cells,
    head: head,
    counts: counts,
    capacity: panel.capacity != null ? String(panel.capacity) : '',
    note: state.note != null ? String(state.note) : state.label != null ? String(state.label) : '',
    summary: parts.length ? parts.join(' · ') : 'empty',
  };
}

/* inflight widget: operations/messages as bars on one shared step axis.
   foldInflightStates (validator.js) supplies complete history snapshots;
   this pure model vets that snapshot for the HTML renderer. */
/* timeline: wall-clock axis over a declared span with periodic cadence
   beats and event dots; steps sweep a `now` cursor and append events.
   Pure model (node-testable, no DOM). */

PanelViews.register('buffer', function (host, panel, state, skin, states, stepIdx, animate) {
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
    (bfm.capacity ? '<span class="bfcap">' + esc(bfm.capacity) + '</span>' : '') +
    '</div>';
  /* note line always emitted (fixed height — never reflows the column) */
  h += '<div class="bfnote">' + esc(bfm.note) + '</div>';
  return { html: h };
});

PanelRegistry.extend('buffer', {
  order: 14,
  label: 'Buffer',
  since: '0.1.0',
});

PanelRegistry.extend('buffer', {
  styles: [
    {
      order: 959,
      css: String.raw`.bfhead{display:flex; gap:3px; height:11px;}
.bfmark{flex:1; text-align:center; font-size:8px; line-height:11px; visibility:hidden;}
.bfmark.on{visibility:visible; animation:bfhead 1.1s ease-in-out infinite alternate;}
.sk-aurora .bfmark.on{color:#8AE8FF;}
.sk-daylight .bfmark.on{color:#4956C9;}
@keyframes bfhead{to{transform:translateY(2px); opacity:.55;}}
.bfrow{display:flex; gap:3px;}
.bfcell{flex:1; height:16px; border-radius:3px; border:1px solid transparent;}
.sk-aurora .bfcell.s-empty{background:#101A2C; border-color:#1D2A40;}
.sk-daylight .bfcell.s-empty{background:#F4F2EC; border-color:#E0DCD1;}
.bfcell.s-buffered{background:#38E1FF;}
.sk-daylight .bfcell.s-buffered{background:#4956C9;}
.bfcell.s-protected{background:#FFB454;}
.sk-daylight .bfcell.s-protected{background:#B0771A;}
.bfcell.s-uploading{background:#A78BFA; animation:ledpulse .7s ease-in-out infinite alternate;}
.sk-daylight .bfcell.s-uploading{background:#7C5CC4;}
.bfcell.s-uploaded{background:#4ADE80; opacity:.55;}
.sk-daylight .bfcell.s-uploaded{background:#0E9382; opacity:.55;}
.bfcell.s-dropped{background:#FF6B5E; opacity:.7;}
.sk-daylight .bfcell.s-dropped{background:#B91C1C; opacity:.7;}
.bffoot{display:flex; justify-content:space-between; gap:8px; margin-top:5px;
  font:600 9.5px 'IBM Plex Mono',monospace; letter-spacing:.05em;}
.sk-aurora .bffoot{color:#5E7396;}
.sk-daylight .bffoot{color:#8A8474;}
.sk-aurora .bfcap{color:#8AE8FF;}
.sk-daylight .bfcap{color:#4956C9;}
.bfnote{height:15px; overflow:hidden; margin-top:2px; white-space:nowrap; text-overflow:ellipsis;
  font:500 10px 'IBM Plex Mono',monospace;}
.sk-aurora .bfnote{color:#93A7C9;}
.sk-daylight .bfnote{color:#6B6F7A;}`,
    },
    {
      order: 1216,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .bfmark.on, .bfcell.s-uploading{animation:none !important;}
}`,
    },
    {
      order: 1421,
      css: String.raw`body.sk-editorial .sk-aurora .bfmark.on,
body.sk-editorial .sk-daylight .bfmark.on{color:var(--ed-accent);}
body.sk-editorial .sk-aurora .bfcell.s-empty,
body.sk-editorial .sk-daylight .bfcell.s-empty{border-color:var(--ed-rule); background:var(--ed-paper);}
body.sk-editorial .sk-aurora .bfcell.s-buffered,
body.sk-editorial .sk-daylight .bfcell.s-buffered{background:var(--ed-accent);}
body.sk-editorial .bfcell{border-radius:1px;}`,
    },
    {
      order: 1639,
      css: String.raw`@media screen {

  body.sk-terminal .sk-aurora .bfmark.on{color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .bfcell{border-radius:0; border:1px solid var(--tm-line);}
}
@media screen {
  body.sk-terminal .sk-aurora .bfcell.s-empty{background:var(--tm-raised); border-color:var(--tm-line);}
}
@media screen {
  body.sk-terminal .bfcell.s-buffered,
  body.sk-terminal .bfcell.s-uploading,
  body.sk-terminal .bfcell.s-uploaded{background:var(--tm-good);}
}
@media screen {
  body.sk-terminal .bfcell.s-protected,
  body.sk-terminal .bfcell.s-dropped{background:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .bffoot,
  body.sk-terminal .bfnote,
  body.sk-terminal .sk-aurora .bffoot,
  body.sk-terminal .sk-aurora .bfnote{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .bfcap{color:var(--tm-good);}
}`,
    },
    {
      order: 1858,
      css: String.raw`@media screen {

  body.sk-pastel .bfrow { gap:4px; }
}
@media screen {
  body.sk-pastel .bfcell { height:17px; border-radius:5px; }
}
@media screen {
  body.sk-pastel .sk-aurora .bfcell.s-empty,
  body.sk-pastel .sk-daylight .bfcell.s-empty { background:#F0F3F7; border-color:#DEE5EE; }
}
@media screen {
  body.sk-pastel .bfcell.s-buffered,
  body.sk-pastel .sk-daylight .bfcell.s-buffered { background:#76A6D4; }
}
@media screen {
  body.sk-pastel .bfcell.s-protected,
  body.sk-pastel .sk-daylight .bfcell.s-protected { background:#D4A15B; }
}
@media screen {
  body.sk-pastel .bfcell.s-uploading,
  body.sk-pastel .sk-daylight .bfcell.s-uploading { background:#9183D4; }
}
@media screen {
  body.sk-pastel .bfcell.s-uploaded,
  body.sk-pastel .sk-daylight .bfcell.s-uploaded { background:#65B087; opacity:.68; }
}
@media screen {
  body.sk-pastel .bfcell.s-dropped,
  body.sk-pastel .sk-daylight .bfcell.s-dropped { background:#D56874; opacity:.78; }
}
@media screen {
  body.sk-pastel .sk-aurora .bfmark.on,
  body.sk-pastel .sk-daylight .bfmark.on,
  body.sk-pastel .sk-aurora .bfcap,
  body.sk-pastel .sk-daylight .bfcap { color:#5263B9; }
}
@media screen {
  body.sk-pastel .bffoot,
  body.sk-pastel .bfnote,
  body.sk-pastel .sk-aurora .bffoot,
  body.sk-pastel .sk-daylight .bffoot,
  body.sk-pastel .sk-aurora .bfnote,
  body.sk-pastel .sk-daylight .bfnote { color:#6C788C; }
}`,
    },
    {
      order: 2092,
      css: String.raw`@media screen {

  body.sk-blueprint .bfhead{height:9px;}
}
@media screen {
  body.sk-blueprint .bfrow{gap:2px;}
}
@media screen {
  body.sk-blueprint .bfcell{height:14px;border-radius:0;}
}
@media screen {
  body.sk-blueprint .docview .bfcell.s-empty{background:#032149;border-color:#2E6D8E;}
}
@media screen {
  body.sk-blueprint .bfcell.s-buffered{background:#58E7FF;}
}
@media screen {
  body.sk-blueprint .bfcell.s-protected{background:#FFD166;}
}
@media screen {
  body.sk-blueprint .bfcell.s-uploading{background:#C3A4FF;}
}
@media screen {
  body.sk-blueprint .bfcell.s-uploaded{background:#47F590;opacity:.65;}
}
@media screen {
  body.sk-blueprint .bfcell.s-dropped{background:#FF5C67;opacity:.85;}
}
@media screen {
  body.sk-blueprint .docview .bffoot,body.sk-blueprint .docview .bfnote{color:#A9CCDD;}
}
@media screen {
  body.sk-blueprint .docview .bfcap{color:#FFFFFF;}
}`,
    },
  ],
});

/* buffer authoring contract; merged into this panel definition by the bundle. */
function bufferStateEditor(context) {
  function cells(options) {
    if (options.value !== undefined && !Array.isArray(options.value)) return null;
    var baseline = options.value !== undefined ? options.value :
      options.effective && Array.isArray(options.effective.value) ? options.effective.value : [];
    var count = bufferSegCount(options.panel), doc = context.document;
    var wrap = doc.createElement('div');wrap.className = 'buffer-cell-editor';
    for (var index = 0; index < count; index++) (function (cellIndex) {
      var current = BUFFER_STATES.indexOf(baseline[cellIndex]) >= 0 ? baseline[cellIndex] :
        baseline[cellIndex] === undefined ? 'empty' : baseline[cellIndex];
      var input = context.controls.select(BUFFER_STATES, current, function (state) {
        var next = baseline.slice();
        while (next.length < count) next.push('empty');
        next[cellIndex] = state;
        return options.commit(next);
      });
      input.setAttribute('aria-label', 'Cell ' + (cellIndex + 1) + ' state');
      var label = doc.createElement('label');label.className = 'buffer-cell-control';
      var number = doc.createElement('span');number.textContent = String(cellIndex + 1);label.appendChild(number);label.appendChild(input);wrap.appendChild(label);
    })(index);
    return wrap;
  }
  function paints(options) {
    var current = options.value;
    if (current !== undefined && (!Array.isArray(current) || current.some(function (op) {
      return !Array.isArray(op) || op.length < 3 || typeof op[0] !== 'number' || typeof op[1] !== 'number';
    }))) return null;
    var rows = (current || []).map(function (op, index) {
      return { from: op[0], to: op[1], state: op[2], _sourceIndex: index };
    });
    var count = bufferSegCount(options.panel);
    return context.controls.rows('Paint ranges', rows, { cols: [
      { k: 'from', label: 'First cell', kind: 'num', req: true },
      { k: 'to', label: 'Last cell', kind: 'num', req: true },
      { k: 'state', label: 'State', kind: 'enum', options: BUFFER_STATES, req: true }
    ]}, { raw: false, commitValue: options.commit, collect: function (items) {
      var operations = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i], from = item.from, to = item.to;
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= count)
          return { error: 'Use whole-number cell indexes from 0 to ' + (count - 1) + ', with First cell no greater than Last cell.' };
        var base = current && current[item._sourceIndex], operation = Array.isArray(base) ? base.slice() : [];
        operation[0] = from;operation[1] = to;operation[2] = item.state;operations.push(operation);
      }
      return { value: operations.length ? operations : undefined };
    }});
  }
  return { patchControl: function (field, options) {
    return field[0] === 'cells' ? cells(options) : field[0] === 'mark' ? paints(options) : null;
  }};
}
PanelRegistry.extend('buffer', {
  authoring: {
    initialFields: true,
    template: { title: 'Buffer', initial: {} },
    setupFields: [
      ['segments', 'num'],
      ['capacity', 'text'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['cells', 'jsonArr'],
      ['mark', 'jsonArr'],
      ['head', 'num'],
      ['note', 'text'],
      ['label', 'text'],
    ],
    expandPatchFields: function (panel) { return [
      ['cells', 'jsonArr'], ['mark', 'jsonArr'], ['head', 'num', { min: 0, max: bufferSegCount(panel) - 1 }],
      ['note', 'text'], ['label', 'text']
    ]; },
    fieldMeta: {
      segments: { label: 'Cell count', help: 'Use 2–48 cells.', group: 'Buffer' },
      capacity: { label: 'Capacity label', help: 'Optional display text such as 4 MiB.', group: 'Buffer' },
      cells: { label: 'Complete cell snapshot', help: 'Replaces every visible cell and clears earlier range paints. Use Paint ranges for ordinary step changes.', step: { advanced: true } },
      mark: { label: 'Paint ranges', initial: { help: 'Range paints applied over the starting cell snapshot.' },
        step: { unsetLabel: 'Paint no ranges at this step', help: 'These range operations apply at this step and accumulate until a complete cell snapshot replaces them.' } },
      head: { label: 'Write head', help: 'Zero-based cell index. Omit it to hide the marker.' },
      note: { label: 'Note' },
      label: { hidden: true },
    },
    editor: bufferStateEditor,
    picker: {
      order: 13,
      name: 'Buffer',
      category: 'State & timing',
      tagline: 'A window of stored data',
      description:
        'Show occupied, written, or locked segments and the write head of a finite buffer.',
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (own(context.currentPatch && context.currentPatch.enterOnce, key))
        return assignment(key, null, true);
      if (key === 'mark' || key === 'cells')
        return history(['cells', 'mark'], true, 'Computed cells/mark history');
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = {
        cells: [
          'buffered',
          'buffered',
          'buffered',
          'protected',
          'protected',
          'protected',
          'empty',
          'empty',
          'empty',
          'empty',
          'empty',
          'empty',
        ],
        head: 6,
        note: '6 of 12 segments in use',
      };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});

PanelRegistry.extend('buffer', { editorStyles: String.raw`
.buffer-cell-editor{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:7px;min-width:0;}
.buffer-cell-control{display:grid;grid-template-columns:22px minmax(0,1fr);align-items:center;gap:5px;min-width:0;font:10px 'IBM Plex Mono',monospace;}
.buffer-cell-control>span{text-align:right;color:var(--muted);}
` });
