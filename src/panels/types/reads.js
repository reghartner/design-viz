/* reads panel: a short authored reference with sequencing reads stacked under
   it, aligned by 1-based coordinate. A teaching display: every read, gap and
   insertion is typed in the spec; nothing is computed from real data files.
   Shared alphabet, range and tone helpers live in ../bio.js. Residue colours
   (`.bio-b-*`) and emphasis tones (`.bio-tone-*`) are owned by the sequence
   panel's styles; this file only reuses those class names. */
var READS_MAX_READS = 24;
var READS_DEFAULT_READS = 12;
var READS_MAX_INSERT = 24;
var READS_MAX_INSERTS = 24;
var READS_MAX_MARKS = 24;
/* Reads that overhang the reference show at most this many soft-clipped
   letters per side, so a hostile `at` can never widen the grid without bound. */
var READS_OVERHANG = 12;
var READS_STATE_KEYS = ['reads', 'inserts', 'focus', 'showDepth', 'marks'];

function readsAlphabet(panel) {
  return panel && panel.alphabet === 'rna' ? 'rna' : 'dna';
}
function readsStart(panel) {
  return panel && bioPosition(panel.start) ? panel.start : 1;
}
function readsMax(panel) {
  var value = panel && panel.maxReads;
  return Number.isSafeInteger(value) && value >= 1 && value <= READS_MAX_READS ? value : READS_DEFAULT_READS;
}
/* Reference text: upper-cased, whitespace removed, capped at the shared
   maximum. Invalid letters stay in place and render as unknown. */
function readsReference(panel) {
  var normalized = bioNormalizeSequence(panel && panel.reference, readsAlphabet(panel));
  return { text: normalized.text.slice(0, BIO_MAX_SEQUENCE), invalid: normalized.invalid.filter(function (i) { return i < BIO_MAX_SEQUENCE; }) };
}
/* Read text accepts the alphabet plus `-` for a deletion gap. */
function readsSequence(value, alphabet, max) {
  var normalized = bioNormalizeSequence(value, alphabet),
    text = normalized.text.slice(0, max),
    invalid = normalized.invalid.filter(function (i) { return i < max && text.charAt(i) !== '-'; });
  return { text: text, invalid: invalid };
}
/* Mismatch = letters differ case-insensitively; N on either side matches. */
function readsClassify(readLetter, refLetter) {
  var r = String(readLetter || '').toUpperCase(), f = String(refLetter || '').toUpperCase();
  if (r === '-') return 'gap';
  if (r === 'N' || f === 'N' || r === f) return 'match';
  return 'mismatch';
}
function readsInvalidLetters(text, invalid) {
  var seen = [];
  invalid.forEach(function (i) { var ch = text.charAt(i); if (seen.indexOf(ch) < 0) seen.push(ch); });
  return seen.join('');
}
function readsDeclarationWarnings(panel, path, warnings) {
  var alphabet = readsAlphabet(panel), reference = readsReference(panel);
  if (panel.alphabet !== undefined && ['dna', 'rna'].indexOf(panel.alphabet) < 0)
    warnings.push(path + '.alphabet: expected dna or rna — using dna');
  if (typeof panel.reference !== 'string' || !reference.text.length)
    warnings.push(path + '.reference: expected 1–' + BIO_MAX_SEQUENCE + ' ' + alphabet + ' letters — panel renders empty');
  else if (bioNormalizeSequence(panel.reference, alphabet).text.length > BIO_MAX_SEQUENCE)
    warnings.push(path + '.reference: only the first ' + BIO_MAX_SEQUENCE + ' letters render');
  if (reference.invalid.length)
    warnings.push(path + '.reference: letters "' + readsInvalidLetters(reference.text, reference.invalid) + '" are not ' + alphabet + ' — shown as unknown');
  if (panel.start !== undefined && !bioPosition(panel.start))
    warnings.push(path + '.start: expected a 1-based safe integer coordinate — using 1');
  if (panel.label !== undefined && typeof panel.label !== 'string')
    warnings.push(path + '.label: expected text — ignored');
  if (panel.maxReads !== undefined && readsMax({maxReads: panel.maxReads}) !== panel.maxReads)
    warnings.push(path + '.maxReads: expected an integer 1–' + READS_MAX_READS + ' — using ' + READS_DEFAULT_READS);
  if (panel.showMatches !== undefined && typeof panel.showMatches !== 'boolean')
    warnings.push(path + '.showMatches: expected true or false — matches render as dots');
  readsPatchWarnings(panel.initial, path + '.initial', panel, warnings);
}
function readsStateWarnings(state, path, panel, warnings) {
  var alphabet = readsAlphabet(panel), reference = readsReference(panel),
    start = readsStart(panel), end = start + Math.max(reference.text.length, 1) - 1, max = readsMax(panel);
  Object.keys(state).forEach(function (key) {
    if (READS_STATE_KEYS.indexOf(key) < 0 && !bioCommonStateKey(key))
      warnings.push(path + '.' + key + ': unknown field — ignored');
  });
  if (panelOwn(state, 'note') && state.note !== null && typeof state.note !== 'string')
    warnings.push(path + '.note: expected text — ignored');
  if (panelOwn(state, 'reads') && state.reads !== null) {
    if (!Array.isArray(state.reads)) warnings.push(path + '.reads: expected an array of {id, at, seq} — ignored');
    else {
      if (state.reads.length > max) warnings.push(path + '.reads: only the first ' + max + ' reads render (maxReads)');
      var seen = Object.create(null);
      state.reads.slice(0, max).forEach(function (read, i) {
        var at = path + '.reads[' + i + ']';
        if (!panelObject(read)) { warnings.push(at + ': expected {id, at, seq} — read skipped'); return; }
        if (typeof read.id !== 'string' || !read.id) { warnings.push(at + '.id: needs a non-empty string — read skipped'); return; }
        if (seen[read.id]) { warnings.push(at + '.id: duplicate read id "' + read.id + '" — later read skipped'); return; }
        seen[read.id] = true;
        if (!bioPosition(read.at)) warnings.push(at + '.at: expected a 1-based reference coordinate — read skipped');
        var seq = readsSequence(read.seq, alphabet, BIO_MAX_SEQUENCE);
        if (typeof read.seq !== 'string' || !seq.text.length)
          warnings.push(at + '.seq: expected 1–' + BIO_MAX_SEQUENCE + ' ' + alphabet + ' letters or - gaps — read skipped');
        else {
          if (bioNormalizeSequence(read.seq, alphabet).text.length > BIO_MAX_SEQUENCE)
            warnings.push(at + '.seq: only the first ' + BIO_MAX_SEQUENCE + ' letters render');
          if (seq.invalid.length)
            warnings.push(at + '.seq: letters "' + readsInvalidLetters(seq.text, seq.invalid) + '" are not ' + alphabet + ' — shown as unknown');
          if (bioPosition(read.at) && (read.at > end || read.at + seq.text.length - 1 < start))
            warnings.push(at + ': read lies entirely outside the reference ' + start + '–' + end + ' — listed without cells');
        }
        if (read.label !== undefined && typeof read.label !== 'string') warnings.push(at + '.label: expected text — ignored');
        if (read.strand !== undefined && read.strand !== '+' && read.strand !== '-') warnings.push(at + '.strand: expected "+" or "-" — ignored');
        if (read.tone !== undefined && BIO_TONES.indexOf(read.tone) < 0) warnings.push(at + '.tone: expected ' + BIO_TONES.join('|') + ' — using neutral');
      });
    }
  }
  if (panelOwn(state, 'inserts') && state.inserts !== null) {
    if (!Array.isArray(state.inserts)) warnings.push(path + '.inserts: expected an array of {read, after, seq} — ignored');
    else {
      if (state.inserts.length > READS_MAX_INSERTS) warnings.push(path + '.inserts: only the first ' + READS_MAX_INSERTS + ' insertions render');
      state.inserts.slice(0, READS_MAX_INSERTS).forEach(function (insert, i) {
        var at = path + '.inserts[' + i + ']';
        if (!panelObject(insert)) { warnings.push(at + ': expected {read, after, seq} — insertion skipped'); return; }
        if (typeof insert.read !== 'string' || !insert.read) warnings.push(at + '.read: needs a read id — insertion skipped');
        if (!bioPosition(insert.after)) warnings.push(at + '.after: expected the 1-based reference coordinate before the insertion — insertion skipped');
        else if (insert.after < start || insert.after > end) warnings.push(at + '.after: coordinate ' + insert.after + ' lies outside the reference ' + start + '–' + end + ' — insertion skipped');
        var seq = readsSequence(insert.seq, alphabet, READS_MAX_INSERT);
        if (typeof insert.seq !== 'string' || !seq.text.length || seq.text.indexOf('-') >= 0 || bioNormalizeSequence(insert.seq, alphabet).text.length > READS_MAX_INSERT)
          warnings.push(at + '.seq: expected 1–' + READS_MAX_INSERT + ' inserted ' + alphabet + ' letters — insertion skipped');
        else if (seq.invalid.length)
          warnings.push(at + '.seq: letters "' + readsInvalidLetters(seq.text, seq.invalid) + '" are not ' + alphabet + ' — shown as unknown');
      });
    }
  }
  if (panelOwn(state, 'focus') && state.focus !== null && typeof state.focus !== 'string')
    warnings.push(path + '.focus: expected a read id or null — ignored');
  if (panelOwn(state, 'showDepth') && state.showDepth !== null && typeof state.showDepth !== 'boolean')
    warnings.push(path + '.showDepth: expected true or false — ignored');
  if (panelOwn(state, 'marks') && state.marks !== null) {
    if (!Array.isArray(state.marks)) warnings.push(path + '.marks: expected an array of {id, from, to} — ignored');
    else {
      if (state.marks.length > READS_MAX_MARKS) warnings.push(path + '.marks: only the first ' + READS_MAX_MARKS + ' marks render');
      var ids = Object.create(null);
      state.marks.slice(0, READS_MAX_MARKS).forEach(function (mark, i) {
        var at = path + '.marks[' + i + ']';
        if (!panelObject(mark)) { warnings.push(at + ': expected {id, from, to} — mark skipped'); return; }
        if (typeof mark.id !== 'string' || !mark.id) { warnings.push(at + '.id: needs a non-empty string — mark skipped'); return; }
        if (ids[mark.id]) { warnings.push(at + '.id: duplicate mark id "' + mark.id + '" — later mark skipped'); return; }
        ids[mark.id] = true;
        bioRange(mark, at, warnings, start, end);
        if (mark.tone !== undefined && BIO_TONES.indexOf(mark.tone) < 0) warnings.push(at + '.tone: expected ' + BIO_TONES.join('|') + ' — using neutral');
        if (mark.label !== undefined && typeof mark.label !== 'string') warnings.push(at + '.label: expected text — ignored');
      });
    }
  }
}
function readsPatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, readsStateWarnings);
}
/* Clean read items in authored order: unique string ids, valid coordinates and
   non-empty text. Output is new objects; the state is never mutated. */
function readsItems(state, panel) {
  var alphabet = readsAlphabet(panel), max = readsMax(panel), seen = Object.create(null), out = [];
  (Array.isArray(state.reads) ? state.reads : []).slice(0, max).forEach(function (read) {
    if (!panelObject(read) || typeof read.id !== 'string' || !read.id || seen[read.id] || !bioPosition(read.at)) return;
    var seq = readsSequence(read.seq, alphabet, BIO_MAX_SEQUENCE);
    if (!seq.text.length) return;
    seen[read.id] = true;
    out.push({ id: read.id, at: read.at, text: seq.text, invalid: seq.invalid,
      label: typeof read.label === 'string' ? read.label : '',
      strand: read.strand === '-' ? '-' : read.strand === '+' ? '+' : '',
      tone: bioTone(read.tone, 'neutral') });
  });
  return out;
}
function readsMarks(state, panel) {
  var start = readsStart(panel), end = start + Math.max(readsReference(panel).text.length, 1) - 1, seen = Object.create(null), out = [];
  (Array.isArray(state.marks) ? state.marks : []).slice(0, READS_MAX_MARKS).forEach(function (mark) {
    if (!panelObject(mark) || typeof mark.id !== 'string' || !mark.id || seen[mark.id]) return;
    var range = bioRange(mark, '', null, start, end);
    if (!range) return;
    seen[mark.id] = true;
    out.push({ id: mark.id, from: Math.max(range.from, start), to: Math.min(range.to, end), tone: bioTone(mark.tone, 'neutral'),
      label: typeof mark.label === 'string' ? mark.label : '' });
  });
  return out;
}
/* Pure presentation model. Coordinates are 1-based reference positions; grid
   columns are zero-based from `grid.from`, which extends past the reference by
   at most READS_OVERHANG letters per side for soft-clipped overhang. Depth
   counts aligned letters (match or mismatch) per reference position; gaps and
   clipped letters do not add depth. */
function readsModel(panel, state) {
  panel = panelObject(panel) ? panel : {};
  state = panelObject(state) ? state : {};
  var alphabet = readsAlphabet(panel), reference = readsReference(panel), start = readsStart(panel),
    length = reference.text.length, end = start + Math.max(length, 1) - 1;
  var items = readsItems(state, panel);
  var gridFrom = start, gridTo = end;
  items.forEach(function (read) {
    var readEnd = read.at + read.text.length - 1;
    read.outside = !length || read.at > end || readEnd < start;
    if (read.outside) return;
    gridFrom = Math.min(gridFrom, Math.max(read.at, start - READS_OVERHANG));
    gridTo = Math.max(gridTo, Math.min(readEnd, end + READS_OVERHANG));
  });
  var columns = gridTo - gridFrom + 1;
  var referenceCells = [];
  for (var i = 0; i < length; i++)
    referenceCells.push({ coord: start + i, col: start + i - gridFrom, ch: reference.text.charAt(i), unknown: reference.invalid.indexOf(i) >= 0 });
  var depth = [];
  for (var d = 0; d < length; d++) depth.push(0);
  var focus = typeof state.focus === 'string' && state.focus ? state.focus : null;
  var focusFound = focus !== null && items.some(function (read) { return read.id === focus; });
  var rows = items.map(function (read) {
    var cells = [], counts = { match: 0, mismatch: 0, gap: 0, clip: 0 }, truncatedLeft = 0, truncatedRight = 0;
    for (var k = 0; k < read.text.length; k++) {
      var coord = read.at + k, ch = read.text.charAt(k);
      if (read.outside) continue;
      if (coord < gridFrom) { truncatedLeft++; continue; }
      if (coord > gridTo) { truncatedRight++; continue; }
      var inside = coord >= start && coord <= end;
      var kind = inside ? readsClassify(ch, reference.text.charAt(coord - start)) : 'clip';
      if (inside && kind !== 'gap') depth[coord - start]++;
      counts[kind]++;
      cells.push({ coord: coord, col: coord - gridFrom, ch: ch, kind: kind, unknown: read.invalid.indexOf(k) >= 0, insert: null });
    }
    return { id: read.id, label: read.label || read.id, strand: read.strand, tone: read.tone, at: read.at,
      end: read.at + read.text.length - 1, length: read.text.length, outside: read.outside, cells: cells, counts: counts,
      truncatedLeft: truncatedLeft, truncatedRight: truncatedRight,
      clipped: counts.clip > 0 || truncatedLeft > 0 || truncatedRight > 0,
      focus: focusFound && read.id === focus, dim: focusFound && read.id !== focus, inserts: [] };
  });
  var inserts = [];
  (Array.isArray(state.inserts) ? state.inserts : []).slice(0, READS_MAX_INSERTS).forEach(function (insert) {
    if (!panelObject(insert) || typeof insert.read !== 'string' || !insert.read || !bioPosition(insert.after)) return;
    if (bioNormalizeSequence(insert.seq, alphabet).text.length > READS_MAX_INSERT) return;
    var seq = readsSequence(insert.seq, alphabet, READS_MAX_INSERT);
    if (!seq.text.length || seq.text.indexOf('-') >= 0) return;
    var row = null;
    rows.some(function (candidate) { if (candidate.id === insert.read) { row = candidate; return true; } return false; });
    var cell = null;
    if (row) row.cells.some(function (candidate) { if (candidate.coord === insert.after && candidate.kind !== 'clip') { cell = candidate; return true; } return false; });
    var entry = { read: insert.read, after: insert.after, seq: seq.text, invalid: seq.invalid, placed: !!cell, orphan: !row };
    if (cell) { cell.insert = cell.insert ? cell.insert + seq.text : seq.text; row.inserts.push(entry); }
    inserts.push(entry);
  });
  var ruler = referenceCells.filter(function (cell, index) { return index === 0 || cell.coord % 10 === 0; })
    .map(function (cell) { return { coord: cell.coord, col: cell.col, label: bioFormatCoord(cell.coord) }; });
  var marks = readsMarks(state, panel).map(function (mark) {
    return { id: mark.id, from: mark.from, to: mark.to, tone: mark.tone, label: mark.label, col: mark.from - gridFrom, span: mark.to - mark.from + 1 };
  });
  var maxDepth = depth.reduce(function (best, value) { return Math.max(best, value); }, 0);
  return { alphabet: alphabet, start: start, end: end, length: length, valid: length > 0,
    label: typeof panel.label === 'string' ? panel.label : '',
    showMatches: panel.showMatches === true, showDepth: state.showDepth !== false,
    grid: { from: gridFrom, to: gridTo, columns: columns }, reference: referenceCells, rows: rows,
    inserts: inserts, marks: marks, depth: depth, maxDepth: maxDepth, ruler: ruler, focus: focus, focusFound: focusFound,
    visibleRows: rows.filter(function (row) { return !row.outside; }).length };
}
function readsCellHTML(cell, model) {
  var classes = 'reads-cell reads-' + cell.kind, text, title = bioFormatCoord(cell.coord) + ': ' + cell.kind;
  if (cell.kind === 'gap') text = '-';
  else if (cell.kind === 'match' && !model.showMatches) text = '.';
  else { text = cell.ch; classes += ' ' + bioLetterClass(cell.unknown ? '?' : cell.ch); }
  if (cell.kind === 'mismatch') classes += ' bio-tone-mismatch';
  if (cell.kind === 'clip') title += ' (soft clip, outside the reference)';
  if (cell.insert) title += ' · insertion after this base: ' + cell.insert;
  return '<span class="' + classes + '" style="--c:' + cell.col + '" title="' + esc(title) + '">' + esc(text) +
    (cell.insert ? '<i class="reads-wedge bio-tone-insert" title="' + esc('insertion ' + cell.insert) + '">▲</i>' : '') + '</span>';
}
function readsHTML(panel, state) {
  state = panelObject(state) ? state : {};
  var model = readsModel(panel, state), h = '';
  var title = (model.label ? model.label + ' ' : 'Reference ') + bioFormatCoord(model.start) + '–' + bioFormatCoord(model.end) + ' (' + model.alphabet + ')';
  var summary = title + ', ' + model.rows.length + (model.rows.length === 1 ? ' read' : ' reads') + ', depth up to ' + model.maxDepth;
  h += '<div class="reads-panel" role="region" aria-label="' + esc('Read alignment: ' + summary) + '">';
  h += '<div class="reads-head"><span class="reads-title">' + esc(model.label || 'Reference') + '</span><span class="reads-meta">' +
    esc(bioFormatCoord(model.start) + '–' + bioFormatCoord(model.end) + ' · ' + model.alphabet + ' · ' + model.rows.length + (model.rows.length === 1 ? ' read' : ' reads') +
      (model.focusFound ? ' · focus ' + model.focus : '')) + '</span></div>';
  if (!model.valid) return softwarePanelShell(h + '<p class="reads-empty">Declare a reference sequence to align reads.</p></div>', state);
  h += '<div class="reads-scroll panel-fill-scroll" tabindex="0"><div class="reads-grid' + (model.showMatches ? ' reads-letters' : '') + '" style="--reads-cols:' + model.grid.columns + '">';
  if (model.showDepth) {
    h += '<div class="reads-row reads-depth"><span class="reads-name">depth</span><span class="reads-cells">';
    model.reference.forEach(function (cell, i) {
      var value = model.depth[i], pct = model.maxDepth ? Math.round(value / model.maxDepth * 100) : 0;
      h += '<span class="reads-dcell" style="--c:' + cell.col + '" title="' + esc('depth ' + value + ' at ' + bioFormatCoord(cell.coord)) + '"><i style="height:' + pct + '%"></i></span>';
    });
    h += '</span></div>';
  }
  h += '<div class="reads-row reads-ruler" aria-hidden="true"><span class="reads-name"></span><span class="reads-cells">';
  model.ruler.forEach(function (tick) { h += '<span class="reads-tick" style="--c:' + tick.col + '">' + esc(tick.label) + '</span>'; });
  h += '</span></div>';
  h += '<div class="reads-row reads-ref"><span class="reads-name">' + esc(model.label || 'ref') + '</span><span class="reads-cells">';
  model.reference.forEach(function (cell) {
    h += '<span class="reads-cell ' + bioLetterClass(cell.unknown ? '?' : cell.ch) + '" style="--c:' + cell.col + '" title="' + esc(bioFormatCoord(cell.coord)) + '">' + esc(cell.ch) + '</span>';
  });
  h += '</span></div>';
  if (model.marks.length) {
    h += '<div class="reads-row reads-marks" aria-hidden="true"><span class="reads-name"></span><span class="reads-cells">';
    model.marks.forEach(function (mark) {
      h += '<span class="reads-band bio-tone-' + mark.tone + '" style="--c:' + mark.col + ';--w:' + mark.span + '" title="' + esc(mark.label || mark.id) + '"></span>';
    });
    h += '</span></div>';
  }
  model.rows.forEach(function (row) {
    var detail = row.label + ' at ' + bioFormatCoord(row.at) + (row.strand ? ' (' + row.strand + ')' : '') + ': ' + row.counts.mismatch + ' mismatch, ' +
      row.counts.gap + ' gap, ' + (row.counts.clip + row.truncatedLeft + row.truncatedRight) + ' clipped' + (row.inserts.length ? ', ' + row.inserts.length + ' insertion' : '');
    h += '<div class="reads-row reads-read' + (row.focus ? ' reads-focus' : '') + (row.dim ? ' reads-dim' : '') + '" title="' + esc(detail) + '">' +
      '<span class="reads-name">' + (row.tone !== 'neutral' ? '<span class="reads-dot bio-tone-' + row.tone + '"></span>' : '') +
      (row.strand ? '<b class="reads-strand">' + esc(row.strand) + '</b>' : '') + esc(row.label) + '</span><span class="reads-cells">';
    if (row.outside) h += '<span class="reads-outside" style="--c:0">' + esc('outside the reference (at ' + bioFormatCoord(row.at) + ')') + '</span>';
    if (row.truncatedLeft) h += '<span class="reads-more" style="--c:' + row.cells[0].col + '">' + esc('… ' + row.truncatedLeft) + '</span>';
    row.cells.forEach(function (cell) { h += readsCellHTML(cell, model); });
    if (row.truncatedRight) h += '<span class="reads-more reads-more-right" style="--c:' + row.cells[row.cells.length - 1].col + '">' + esc(row.truncatedRight + ' …') + '</span>';
    h += '</span></div>';
  });
  if (!model.rows.length) h += '<div class="reads-row"><span class="reads-name"></span><span class="reads-cells"><span class="reads-empty" style="--c:0">No reads at this step</span></span></div>';
  h += '</div></div>';
  var legend = [];
  model.marks.forEach(function (mark) {
    legend.push('<li><span class="reads-key bio-tone-' + mark.tone + '"></span>' + esc((mark.label || mark.id) + ' ' + bioFormatCoord(mark.from) + '–' + bioFormatCoord(mark.to)) + '</li>');
  });
  model.inserts.forEach(function (insert) {
    legend.push('<li><span class="reads-key bio-tone-insert">▲</span>' + esc(insert.seq + ' after ' + bioFormatCoord(insert.after) + ' in ' + insert.read +
      (insert.orphan ? ' (no such read)' : insert.placed ? '' : ' (outside that read)')) + '</li>');
  });
  if (model.rows.some(function (row) { return row.clipped; })) legend.push('<li><span class="reads-key reads-key-clip"></span>soft clip beyond the reference</li>');
  if (legend.length) h += '<ul class="reads-legend">' + legend.join('') + '</ul>';
  return softwarePanelShell(h + '</div>', state);
}
PanelRegistry.define('reads', {
  label: 'Read alignment', since: '0.2.0', unified: true, order: 41,
  validateDeclaration: readsDeclarationWarnings, validatePatch: readsPatchWarnings,
  fold: function (panel, steps) {
    var arrayOrNull = function (value) { return value === null || Array.isArray(value); };
    return foldCommonPanelStates(panel, steps, { accept: {
      reads: arrayOrNull, inserts: arrayOrNull, marks: arrayOrNull,
      focus: function (value) { return value === null || typeof value === 'string'; },
      showDepth: function (value) { return value === null || typeof value === 'boolean'; } } });
  },
  render: function (host, panel, state) { return { html: readsHTML(panel, state) }; },
  presentation: { ambientInitial: true },
  layout: { sectionSizing: { minWidth: 360, preferredWidth: 560, maxWidth: 1000, aspectPolicy: 'content', grow: 1 } },
  styles: String.raw`
.reads-panel{font-size:12px;line-height:1.4;color:var(--dtext);min-width:0;--reads-cell:14px}
.reads-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.reads-title{font-weight:600;color:var(--dink)}
.reads-meta{font-size:10px;color:var(--dfaint)}
.reads-scroll{overflow:auto;max-height:320px;border:1px solid color-mix(in srgb,var(--dtext) 18%,transparent);border-radius:6px;padding:4px 6px 6px 0}
.reads-scroll:focus-visible{outline:2px solid var(--dink);outline-offset:2px}
.reads-grid{display:inline-grid;grid-template-columns:max-content max-content;min-width:100%;font:11px/1 'IBM Plex Mono',monospace}
.reads-row{display:contents}
.reads-name{display:flex;align-items:center;gap:4px;padding:0 8px 0 6px;height:calc(var(--reads-cell) + 4px);font-size:10px;color:var(--dink);white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}
.reads-dot{flex:none;width:7px;height:7px;border-radius:50%}
.reads-strand{font-weight:600;color:var(--dfaint)}
.reads-cells{position:relative;display:grid;grid-template-columns:repeat(var(--reads-cols),var(--reads-cell));grid-template-rows:var(--reads-cell);align-items:center;height:calc(var(--reads-cell) + 4px);padding-right:var(--reads-cell)}
.reads-cell,.reads-dcell,.reads-tick,.reads-band,.reads-more,.reads-outside,.reads-empty{grid-row:1;grid-column:calc(var(--c) + 1)}
.reads-cell{position:relative;display:flex;align-items:center;justify-content:center;width:var(--reads-cell);height:var(--reads-cell);border-radius:2px;text-align:center}
/* Zero-specificity fallbacks: the shared .bio-tone-* classes (owned by the sequence panel) win whenever present. */
:where(.reads-mismatch,.reads-band,.reads-key,.reads-dot,.reads-wedge){background:color-mix(in srgb,var(--dtext) 22%,transparent)}
.reads-match{color:var(--dfaint)}
.reads-letters .reads-match{opacity:.75}
.reads-mismatch{font-weight:700}
.reads-gap{color:var(--dfaint);letter-spacing:0}
.reads-clip{opacity:.4}
.reads-wedge{position:absolute;right:-5px;bottom:-5px;font-size:8px;line-height:1;font-style:normal;padding:0 1px;border-radius:2px;z-index:1}
.reads-read .reads-cells::before{content:'';position:absolute;inset:3px 0;border-radius:3px;background:color-mix(in srgb,var(--dtext) 5%,transparent);pointer-events:none}
.reads-focus .reads-cells::before{background:color-mix(in srgb,var(--dink) 14%,transparent);outline:1px solid color-mix(in srgb,var(--dink) 60%,transparent)}
.reads-focus .reads-name{font-weight:700}
.reads-dim{opacity:.35}
.reads-depth .reads-cells,.reads-depth .reads-name{height:26px}
.reads-depth .reads-cells{grid-template-rows:22px;align-items:end;border-bottom:1px solid color-mix(in srgb,var(--dtext) 24%,transparent)}
.reads-dcell{display:flex;align-items:flex-end;width:var(--reads-cell);height:22px;padding:0 2px}
.reads-dcell i{display:block;width:100%;min-height:1px;border-radius:1px 1px 0 0;background:color-mix(in srgb,var(--dink) 38%,transparent)}
.reads-ruler .reads-cells,.reads-ruler .reads-name{height:14px}
.reads-ruler .reads-cells{grid-template-rows:14px}
.reads-tick{position:relative;font-size:9px;color:var(--dfaint);white-space:nowrap;padding-left:1px;border-left:1px solid color-mix(in srgb,var(--dtext) 35%,transparent);height:12px;line-height:12px}
.reads-ref .reads-cell{font-weight:600;color:var(--dink)}
.reads-marks .reads-cells,.reads-marks .reads-name{height:8px}
.reads-marks .reads-cells{grid-template-rows:6px}
.reads-band{grid-column:calc(var(--c) + 1)/span var(--w);height:6px;border-radius:3px}
.reads-more{font-size:9px;color:var(--dfaint);white-space:nowrap;justify-self:end;transform:translateX(calc(-1 * var(--reads-cell)))}
.reads-more-right{justify-self:start;transform:translateX(var(--reads-cell))}
.reads-outside,.reads-empty{grid-column:1/-1;font-size:10px;color:var(--dfaint);white-space:nowrap;padding-left:2px}
p.reads-empty{margin:4px 0;font-size:11px}
.reads-legend{list-style:none;display:flex;flex-wrap:wrap;gap:4px 12px;margin:6px 0 0;padding:0;font-size:10px;color:var(--dfaint)}
.reads-legend li{display:flex;align-items:center;gap:5px}
.reads-key{display:inline-flex;align-items:center;justify-content:center;width:12px;height:8px;border-radius:2px;font-size:8px;line-height:1}
.reads-key-clip{background:color-mix(in srgb,var(--dtext) 18%,transparent);opacity:.5}
@media print{.reads-scroll{max-height:none;overflow:visible}.reads-cell,.reads-band,.reads-dcell i,.reads-wedge{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`,
  authoring: {
    initialFields: true,
    transientFields: ['focus', 'showDepth'],
    template: {
      title: 'Read alignment', reference: 'ACGTTGCATGCCTAGGATCCAGTTACGGAATCGATCG', alphabet: 'dna', start: 1, label: 'Reference', maxReads: 12,
      initial: { reads: [
        { id: 'r1', at: 3, seq: 'GTTGCATGCCTAGG', strand: '+' },
        { id: 'r2', at: 8, seq: 'ATGCCTAGGATCCAGTT', strand: '-' } ], showDepth: true }
    },
    setupFields: [['reference', 'text'], ['alphabet', 'text'], ['start', 'num'], ['label', 'text'], ['maxReads', 'num'], ['showMatches', 'text'], ['initial', 'json']],
    patchFields: [['reads', 'jsonArr'], ['inserts', 'jsonArr'], ['focus', 'text'], ['showDepth', 'bool'], ['marks', 'jsonArr'], ['note', 'text']],
    fieldMeta: {
      reference: { label: 'Reference sequence', help: '1–240 letters of the alphabet; whitespace is removed. Other letters warn and render as unknown.' },
      alphabet: { label: 'Alphabet', help: 'dna (ACGTN) or rna (ACGUN).' },
      start: { label: 'First coordinate', help: '1-based coordinate of the first reference letter. Read positions use the same numbering.' },
      label: { label: 'Reference label' },
      maxReads: { label: 'Maximum reads', help: '1–24 reads render per step; extra authored reads warn and are ignored. Default 12.' },
      showMatches: { label: 'Show matching letters', help: 'Off shows matches as dots so mismatches stand out; on prints every read letter.' },
      reads: { label: 'Reads', help: 'A complete snapshot: [{id, at, seq, label?, strand?, tone?}]. at is the 1-based reference coordinate of the first aligned letter; seq uses letters and - for a deletion gap. Letters beyond the reference render dimmed as soft clips.', nullLabel: 'No reads' },
      inserts: { label: 'Insertions', help: '[{read, after, seq}]: inserted letters that sit between reference coordinate after and after+1 in that read. Drawn as a wedge; the reference does not shift.', nullLabel: 'No insertions' },
      focus: { label: 'Focus read', help: 'Read id to emphasise; other reads dim.', nullLabel: 'No focus' },
      showDepth: { label: 'Show coverage depth', help: 'Default on: a thin bar per reference position counting aligned letters (gaps and clips excluded).' },
      marks: { label: 'Reference marks', help: '[{id, from, to, tone?, label?}] in reference coordinates, drawn as a band under the reference and listed in the legend.', nullLabel: 'No marks' },
      note: { label: 'Explanation' }
    },
    /* Alphabet and match display are fixed choices, so the inspector shows
       selects instead of free text (the `text` kind only names the fallback). */
    editor: function (context) {
      function select(label, options, value, onChange) {
        var el = context.document.createElement('select');
        el.className = 'fctl'; el.setAttribute('aria-label', label);
        options.forEach(function (pair) {
          var option = context.document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; el.appendChild(option);
        });
        el.value = value;
        context.listen(el, 'change', function () { onChange(el.value); });
        return context.controls.row(label, el);
      }
      return { setupField: function (field, panel) {
        if (field[0] === 'alphabet')
          return select('Alphabet', [['dna', 'DNA · ACGTN'], ['rna', 'RNA · ACGUN']], panel.alphabet === 'rna' ? 'rna' : 'dna',
            function (value) { context.commit('alphabet', JSON.stringify(value)); });
        if (field[0] === 'showMatches')
          return select('Matching letters', [['dots', 'Dots · mismatches stand out'], ['letters', 'Letters · print every base']], panel.showMatches === true ? 'letters' : 'dots',
            function (value) { context.commit('showMatches', value === 'letters' ? 'true' : null); });
      } };
    },
    picker: { order: 41, name: 'Read alignment', category: 'Science & sequencing', tagline: 'Reads stacked under a reference.',
      description: 'A short authored reference with sequencing reads aligned by coordinate: mismatches, deletion gaps, insertions and soft clips stay visible, with a coverage depth bar above the reference.' },
    example: function (sample) {
      sample.panel.reference = 'ACGTTGCATGCCTAGGATCCAGTTACGGAATCGATCGTTAGCCATGA';
      sample.panel.start = 1201;
      sample.panel.label = 'chr7 fragment';
      sample.state = { reads: [
        { id: 'r1', at: 1203, seq: 'GTTGCATGCCTAGG', strand: '+' },
        { id: 'r2', at: 1208, seq: 'ATGCCTAGGATCCTGTT', strand: '-' },
        { id: 'r3', at: 1214, seq: 'AG-ATCCAGTTACGGAATC', strand: '+' },
        { id: 'r4', at: 1220, seq: 'CAGTTACGGAATCGATCGTTAGCCATGATTT', strand: '+', tone: 'accent' },
        { id: 'r5', at: 1198, seq: 'TTTACGTTGCATGCC', strand: '-' } ],
        inserts: [{ read: 'r4', after: 1230, seq: 'GA' }],
        marks: [{ id: 'snp', from: 1221, to: 1221, tone: 'mismatch', label: 'candidate SNP' }],
        focus: 'r2', showDepth: true, note: 'Illustrative reads; r2 carries an A→T mismatch and r4 a two-letter insertion.' };
      sample.panel.initial = JSON.parse(JSON.stringify(sample.state));
      return sample;
    }
  }
});
