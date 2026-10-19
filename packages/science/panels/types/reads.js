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
  var depth = [], alleles = [];
  for (var d = 0; d < length; d++) { depth.push(0); alleles.push({}); }
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
      if (inside && kind !== 'gap') {
        depth[coord - start]++;
        var base = ch.toUpperCase(), tally = alleles[coord - start];
        tally[base] = (tally[base] || 0) + 1;
      }
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
    inserts: inserts, marks: marks, depth: depth, alleles: alleles, maxDepth: maxDepth, ruler: ruler, focus: focus, focusFound: focusFound,
    visibleRows: rows.filter(function (row) { return !row.outside; }).length };
}
function readsCellHTML(cell, model) {
  var classes = 'reads-cell reads-' + cell.kind, text, title = bioFormatCoord(cell.coord) + ': ' + cell.kind;
  if (cell.kind === 'gap') text = '-';
  else if (cell.kind === 'match' && !model.showMatches) text = '.';
  else { text = cell.ch; classes += ' ' + bioLetterClass(cell.unknown ? '?' : cell.ch); }
  if (cell.kind === 'mismatch') {
    classes += ' bio-tone-mismatch';
    /* A mismatch supported by one read at depth 3+ is drawn faint;
       one shared by two or more reads stays solid. This reflects support,
       not base-call quality. */
    var at = cell.coord - model.start, tally = model.alleles[at];
    if (tally && model.depth[at] >= 3 && tally[String(cell.ch).toUpperCase()] === 1) classes += ' reads-low-support';
  }
  if (cell.kind === 'clip') title += ' (soft clip, outside the reference)';
  if (cell.insert) title += ' · insertion after this base: ' + cell.insert;
  return '<span class="' + classes + '" style="--c:' + cell.col + '" title="' + esc(title) + '">' + esc(text) +
    (cell.insert ? '<i class="reads-wedge bio-tone-insert" title="' + esc('insertion ' + cell.insert) + '">▲</i>' : '') + '</span>';
}
/* Decorative column highlights: each reference mark draws one column from
   the reference row down to the last read, absolutely placed on the grid
   (grid lines `from`/`to`), so a site reads straight down the pile without
   a tile per row. */
function readsHighlightHTML(model, from, to) {
  return model.marks.map(function (mark) {
    return '<span class="reads-hl bio-tone-' + mark.tone + '" style="--c:' + mark.col + ';--w:' + mark.span + ';grid-row:' + from + '/' + to + '" aria-hidden="true"></span>';
  }).join('');
}
/* Decorative allele split for one depth bar (IGV-style): at a marked column
   where the aligned reads disagree, the bar stacks one segment per letter,
   the reference letter at the base, the rest by count. Empty otherwise. */
function readsAlleleHTML(model, index, marked) {
  var tally = model.alleles[index], letters = Object.keys(tally || {});
  if (!marked || letters.length < 2) return '';
  var ref = model.reference[index].ch.toUpperCase();
  letters.sort(function (a, b) { return (a === ref ? -1 : 0) - (b === ref ? -1 : 0) || tally[b] - tally[a] || (a < b ? -1 : 1); });
  return letters.map(function (letter) {
    return '<b class="' + bioLetterClass(letter).replace('bio-b ', '') + '" style="flex:' + tally[letter] + '"></b>';
  }).join('');
}
/* Step outline over the depth bars, in one SVG spanning the reference columns. */
function readsDepthLineHTML(model) {
  if (!model.maxDepth || !model.reference.length) return '';
  var n = model.reference.length, d = '';
  model.depth.forEach(function (value, i) {
    var y = (100 - value / model.maxDepth * 100).toFixed(2);
    d += (i ? 'V' + y : 'M0 ' + y) + 'H' + (i + 1);
  });
  return '<svg class="reads-dline" style="--c:' + model.reference[0].col + ';--w:' + n + '" viewBox="0 0 ' + n + ' 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<path d="' + d + '" vector-effect="non-scaling-stroke"/></svg>';
}
function readsHTML(panel, state) {
  state = panelObject(state) ? state : {};
  var model = readsModel(panel, state), h = '';
  var title = (model.label ? model.label + ' ' : 'Reference ') + bioFormatCoord(model.start) + '–' + bioFormatCoord(model.end) + ' (' + model.alphabet + ')';
  var summary = title + ', ' + model.rows.length + (model.rows.length === 1 ? ' read' : ' reads') + ', depth up to ' + model.maxDepth;
  h += '<div class="reads-panel panel-fill-column" role="region" aria-label="' + esc('Read alignment: ' + summary) + '">';
  h += '<div class="reads-head"><span class="reads-title">' + esc(model.label || 'Reference') + '</span><span class="reads-meta">' +
    esc(bioFormatCoord(model.start) + '–' + bioFormatCoord(model.end) + ' · ' + model.alphabet + ' · ' + model.rows.length + (model.rows.length === 1 ? ' read' : ' reads') +
      (model.focusFound ? ' · focus ' + model.focus : '')) + '</span></div>';
  if (!model.valid) return softwarePanelShell(h + '<p class="reads-empty">Declare a reference sequence to align reads.</p></div>', state);
  h += '<div class="reads-scroll panel-fill-scroll" tabindex="0"><div class="reads-grid' + (model.showMatches ? ' reads-letters' : '') + '" style="--reads-cols:' + model.grid.columns + '">';
  if (model.showDepth) {
    h += '<div class="reads-row reads-depth"><span class="reads-name">depth</span><span class="reads-cells">';
    model.reference.forEach(function (cell, i) {
      var value = model.depth[i], pct = model.maxDepth ? Math.round(value / model.maxDepth * 100) : 0,
        split = readsAlleleHTML(model, i, model.marks.some(function (mark) { return cell.coord >= mark.from && cell.coord <= mark.to; }));
      h += '<span class="reads-dcell' + (split ? ' reads-dsplit' : '') + '" style="--c:' + cell.col + '" title="' + esc('depth ' + value + ' at ' + bioFormatCoord(cell.coord)) + '"><i style="height:' + pct + '%">' + split + '</i></span>';
    });
    h += readsDepthLineHTML(model) + (model.maxDepth ? '<span class="reads-dscale" aria-hidden="true">' + model.maxDepth + '×</span>' : '') + '</span></div>';
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
    if (row.cells.length) h += '<span class="reads-lane' + (row.strand === '+' ? ' reads-lane-plus' : row.strand === '-' ? ' reads-lane-minus' : '') +
      '" style="--c:' + row.cells[0].col + ';--w:' + (row.cells[row.cells.length - 1].col - row.cells[0].col + 1) + '" aria-hidden="true"></span>';
    if (row.outside) h += '<span class="reads-outside" style="--c:0">' + esc('outside the reference (at ' + bioFormatCoord(row.at) + ')') + '</span>';
    if (row.truncatedLeft) h += '<span class="reads-more" style="--c:' + row.cells[0].col + '">' + esc('… ' + row.truncatedLeft) + '</span>';
    row.cells.forEach(function (cell) { h += readsCellHTML(cell, model); });
    if (row.truncatedRight) h += '<span class="reads-more reads-more-right" style="--c:' + row.cells[row.cells.length - 1].col + '">' + esc(row.truncatedRight + ' …') + '</span>';
    h += '</span></div>';
  });
  if (!model.rows.length) h += '<div class="reads-row"><span class="reads-name"></span><span class="reads-cells"><span class="reads-empty" style="--c:0">No reads at this step</span></span></div>';
  var refLine = model.showDepth ? 3 : 2;
  h += readsHighlightHTML(model, refLine, refLine + 1 + (model.marks.length ? 1 : 0) + Math.max(model.rows.length, 1)) + '</div></div>';
  var legend = [];
  model.marks.forEach(function (mark) {
    legend.push('<li><span class="reads-key bio-tone-' + mark.tone + '"></span>' + esc(mark.label || mark.id) + ' <small>' +
      esc(bioFormatCoord(mark.from) + (mark.to !== mark.from ? '–' + bioFormatCoord(mark.to) : '')) + '</small></li>');
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
  label: 'Read alignment', since: '0.2.0', order: 41,
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
.reads-panel{font-size:12px;line-height:1.4;color:var(--sq-text,var(--dtext));min-width:0;--reads-cell:14px}
/* Head plate (shared rhythm with sequence and locus): ink title, coordinates
   as a quiet tabular chip, a hairline beneath. */
.reads-head{display:flex;justify-content:space-between;align-items:center;gap:2px 10px;flex-wrap:wrap;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--sq-line,color-mix(in srgb,var(--dtext) 14%,transparent));line-height:18px}
.reads-title{font-size:13px;font-weight:600;letter-spacing:-.005em;color:var(--sq-ink,var(--dink))}
.reads-meta{font:500 10.5px/16px 'IBM Plex Mono',monospace;color:var(--sq-muted,var(--dfaint));font-variant-numeric:tabular-nums lining-nums;white-space:nowrap}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .reads-meta{padding:0 8px;border-radius:999px;background:var(--sq-well);box-shadow:inset 0 0 0 1px var(--sq-well-line)}
body.sk-blueprint .reads-meta{border-radius:2px}
/* One frame: the card. The alignment sits on a borderless tinted well. */
.reads-scroll{overflow:auto;max-height:320px;border:1px solid var(--sq-well-line,color-mix(in srgb,var(--dtext) 18%,transparent));border-radius:10px;padding:4px 6px 6px 0;background:var(--sq-well,transparent)}
.sk-aurora .reads-scroll,body.sk-pastel .reads-scroll{border-color:transparent}
body.sk-blueprint .reads-scroll{border-radius:0;border-color:var(--sq-well-line)}
.reads-scroll:focus-visible{outline:2px solid var(--sq-accent,var(--dink));outline-offset:2px}
.reads-grid{position:relative;display:inline-grid;grid-template-columns:max-content max-content;min-width:100%;font:11px/1 'IBM Plex Mono',monospace}
.reads-row{display:contents}
.reads-name{display:flex;align-items:center;gap:5px;padding:0 10px 0 8px;height:calc(var(--reads-cell) + 4px);font:500 11px/1 'IBM Plex Sans',sans-serif;color:var(--sq-text,var(--dink));white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}
.reads-dot{flex:none;width:7px;height:7px;border-radius:50%;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone,currentColor) 70%,var(--sq-edge-mix,var(--dink)))}
.reads-strand{font:600 11px/1 'IBM Plex Mono',monospace;color:var(--sq-muted,var(--dfaint))}
.reads-cells{position:relative;display:grid;grid-template-columns:repeat(var(--reads-cols),var(--reads-cell));grid-template-rows:var(--reads-cell);align-items:center;height:calc(var(--reads-cell) + 4px);padding-right:var(--reads-cell)}
.reads-cell,.reads-dcell,.reads-tick,.reads-band,.reads-more,.reads-outside,.reads-empty,.reads-lane,.reads-dline{grid-row:1;grid-column:calc(var(--c) + 1)}
.reads-cell{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;width:var(--reads-cell);height:var(--reads-cell);border-radius:3px;text-align:center}
/* Zero-specificity fallbacks: the shared .bio-tone-* classes (owned by the sequence panel) win whenever present. */
:where(.reads-mismatch,.reads-band,.reads-key,.reads-dot,.reads-wedge){background:color-mix(in srgb,var(--dtext) 22%,transparent)}
/* Each read is a rounded lane spanning only its own letters (IGV-style);
   a strand gives the lane a pointed end in its direction. */
.reads-lane{grid-column:calc(var(--c) + 1)/span var(--w);align-self:center;height:var(--reads-cell);border-radius:4px;background:var(--sq-well-line,color-mix(in srgb,var(--dtext) 8%,transparent));pointer-events:none}
.reads-lane-plus{border-radius:4px 0 0 4px;clip-path:polygon(0 0,calc(100% - 5px) 0,100% 50%,calc(100% - 5px) 100%,0 100%)}
.reads-lane-minus{border-radius:0 4px 4px 0;clip-path:polygon(5px 0,100% 0,100% 100%,5px 100%,0 50%)}
body.sk-blueprint .reads-lane{border-radius:0;background:rgba(127,227,255,.12);box-shadow:inset 0 0 0 1px rgba(127,227,255,.35)}
/* A reference mark is one tinted column from the reference row to the last
   read, with hairline tone edges: a site reads straight down the pile. */
.reads-hl{position:absolute;z-index:1;grid-column:2;top:0;bottom:0;left:calc(var(--c) * var(--reads-cell));width:calc(var(--w) * var(--reads-cell));border-radius:4px;pointer-events:none}
.reads-hl[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) 9%,transparent);border:0;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone) 26%,transparent)}
body.sk-blueprint .reads-hl{border-radius:0}
.reads-match{color:var(--sq-muted,var(--dfaint))}
.reads-match:not(.bio-b){color:transparent}
.reads-match:not(.bio-b)::before{content:'';position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:var(--sq-muted,var(--dfaint));opacity:.8}
.reads-letters .reads-match{opacity:.75}
.reads-mismatch{font-weight:700}
/* Mismatch tiles are the printed callouts of the pile: a bad-soft tile with
   a tone edge, lifted 1 px. Blueprint draws them as line art instead. */
.reads-mismatch[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) var(--reads-mm,24%),var(--sq-surface,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone) 70%,var(--sq-surface,transparent)),var(--sq-lift,0 0 0 0 transparent)}
body.sk-pastel .reads-mismatch{--reads-mm:24%}
/* On the pink tile the base letter leans toward the ink so it stays AA. */
@media screen{body.sk-pastel .reads-mismatch.bio-b{color:color-mix(in srgb,var(--bio-letter) 68%,#24324A)}}
.sk-aurora .reads-mismatch{--reads-mm:22%}
body.sk-blueprint .reads-mismatch[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) 30%,var(--sq-surface));box-shadow:inset 0 0 0 1px var(--bio-tone)}
.reads-gap{color:transparent;letter-spacing:0}
.reads-gap::before{content:'';position:absolute;left:0;right:0;top:50%;height:1.5px;margin-top:-.75px;background:var(--sq-muted,var(--dfaint))}
.reads-clip{opacity:.7;color:var(--sq-muted,var(--dfaint));font-style:italic}
.reads-wedge{position:absolute;right:-5px;bottom:-5px;z-index:2;width:9px;height:7px;padding:0;font-size:10px;line-height:1;font-style:normal;color:transparent;overflow:hidden;border-radius:0;clip-path:polygon(50% 0,100% 100%,0 100%)}
.reads-wedge[class*="bio-tone-"]{background:var(--bio-tone)}
.reads-focus .reads-lane{background:var(--sq-accent-soft,color-mix(in srgb,var(--dink) 14%,transparent));box-shadow:inset 0 0 0 1px var(--sq-accent-line,color-mix(in srgb,var(--dink) 60%,transparent))}
/* The focused read is the one raised lane in the pile. */
:is(.sk-aurora,.sk-pastel) .reads-focus .reads-lane{position:relative;z-index:1;box-shadow:inset 0 0 0 1px var(--sq-accent-line),var(--sq-raise)}
.reads-focus .reads-lane-plus,.reads-focus .reads-lane-minus{background:var(--sq-accent-line,color-mix(in srgb,var(--dink) 30%,transparent))}
.reads-focus .reads-name{font-weight:700;color:var(--sq-accent-ink,var(--dink));box-shadow:inset 3px 0 0 var(--sq-accent,var(--dink))}
/* Other reads step back but stay readable (never below .7): the accent lane
   and gutter bar carry the focus. */
.reads-dim .reads-cells{opacity:.75}
.reads-dim .reads-name{color:var(--sq-muted,var(--dfaint))}
.reads-dim .reads-dot{opacity:.75}
/* Coverage: a slate step-area with a crisp outline and a hairline baseline. */
.reads-depth .reads-cells,.reads-depth .reads-name{height:28px}
.reads-depth .reads-name{color:var(--sq-muted,var(--dfaint));align-items:flex-end;padding-bottom:3px;box-sizing:border-box}
.reads-depth .reads-cells{grid-template-rows:24px;align-items:end;border-bottom:1px solid var(--sq-line-strong,color-mix(in srgb,var(--dtext) 24%,transparent))}
.reads-depth .reads-hl{z-index:0}
.reads-dcell{position:relative;z-index:0;display:flex;align-items:flex-end;width:var(--reads-cell);height:22px;padding:0 2px;box-sizing:border-box}
.reads-dcell i{display:block;width:100%;min-height:1px;border-radius:1px 1px 0 0;background:color-mix(in srgb,var(--dink) 38%,transparent)}
.sk-aurora .reads-dcell,body.sk-pastel .reads-dcell,body.sk-blueprint .reads-dcell{padding:0}
/* Coverage is a neutral slate area (the authored captions call it the grey
   bars) under a muted step line; only the allele split carries colour. */
.sk-aurora .reads-dcell i{border-radius:0;background:linear-gradient(180deg,#2E4466,#1D2A40) left bottom/100% 22px no-repeat}
body.sk-pastel .reads-dcell i{border-radius:0;background:linear-gradient(180deg,#C9D2E1,#EEF1F5) left bottom/100% 22px no-repeat}
body.sk-blueprint .reads-dcell i{border-radius:0;background:rgba(148,188,213,.28)}
/* Allele split at a marked site: base-coloured segments, reference letter at
   the bottom, so a heterozygous column reads as G 3 / A 2 at a glance. */
.reads-dcell.reads-dsplit i,:is(.sk-aurora,.sk-pastel,.sk-blueprint) .reads-dcell.reads-dsplit i{display:flex;flex-direction:column-reverse;gap:1px;margin:0 1.5px;width:auto;flex:1;background:none}
.reads-dsplit b{display:block;min-height:2px;background:color-mix(in srgb,var(--bio-letter,var(--dtext)) 80%,var(--sq-surface,transparent))}
.reads-dsplit b:last-child{border-radius:2px 2px 0 0}
body.sk-blueprint .reads-dsplit b{border-radius:0;background:color-mix(in srgb,var(--bio-letter,#7FE3FF) 55%,var(--sq-surface));box-shadow:inset 0 0 0 1px var(--bio-letter,#7FE3FF)}
.reads-dline{display:none}
.sk-aurora .reads-dline,body.sk-pastel .reads-dline,body.sk-blueprint .reads-dline{display:block;position:relative;z-index:2;grid-column:calc(var(--c) + 1)/span var(--w);align-self:end;width:100%;height:22px;overflow:visible;pointer-events:none}
.reads-dline path{fill:none;stroke:var(--reads-dline,var(--sq-muted,currentColor));stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
body.sk-pastel .reads-dline{--reads-dline:#5F6C84}.sk-aurora .reads-dline{--reads-dline:#8DA2C6}body.sk-blueprint .reads-dline{--reads-dline:#94BCD5}
/* The peak depth as a quiet scale tag (IGV's data range). */
.reads-dscale{display:none}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .reads-dscale{display:block;grid-row:1;grid-column:1;position:relative;z-index:3;align-self:start;justify-self:start;margin-top:-1px;padding:0 4px;border-radius:999px;font:600 10px/12px 'IBM Plex Mono',monospace;color:var(--sq-muted);background:color-mix(in srgb,var(--sq-well) 82%,transparent);font-variant-numeric:tabular-nums lining-nums;pointer-events:none;white-space:nowrap}
body.sk-blueprint .reads-dscale{border-radius:0}
.reads-mismatch.reads-low-support{font-weight:500}
/* In the shaped skins the letter keeps its full AA colour; lower support is
   carried by a lighter weight and a faint, unlifted tile. */
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .reads-mismatch.reads-low-support[class*="bio-tone-"]{opacity:1;font-weight:500;background:color-mix(in srgb,var(--bio-tone) 6%,var(--sq-surface));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone) 38%,var(--sq-surface))}
body.sk-blueprint .reads-dline path{stroke-linecap:square;stroke-linejoin:miter}
.reads-ruler .reads-cells,.reads-ruler .reads-name{height:16px}
.reads-ruler .reads-cells{grid-template-rows:16px}
.reads-tick{position:relative;font:500 10px/12px 'IBM Plex Mono',monospace;color:var(--sq-muted,var(--dfaint));font-variant-numeric:tabular-nums lining-nums;white-space:nowrap;padding-left:3px;border-left:1px solid var(--sq-line-strong,color-mix(in srgb,var(--dtext) 35%,transparent));height:12px;align-self:end}
.reads-ref .reads-cell{font-weight:600;color:var(--sq-ink,var(--dink))}
.sk-aurora .reads-ref .reads-cell,body.sk-pastel .reads-ref .reads-cell,body.sk-blueprint .reads-ref .reads-cell{color:var(--sq-ink)}
/* The reference keeps quiet ink letters, each over a short 2 px dash of its
   base colour: a key ribbon that never competes with the mismatches. */
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .reads-ref .reads-cell::after{content:'';position:absolute;left:3px;right:3px;bottom:-2px;height:2px;border-radius:1px;background:var(--bio-letter,transparent)}
body.sk-blueprint .reads-ref .reads-cell::after{border-radius:0}
.reads-marks .reads-cells,.reads-marks .reads-name{height:10px}
.reads-marks .reads-cells{grid-template-rows:6px}
.reads-band{grid-column:calc(var(--c) + 1)/span var(--w);height:6px;box-sizing:border-box;border-radius:var(--sq-r,3px)}
.reads-band[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) var(--sq-tint,32%),var(--sq-surface,transparent));border:1px solid color-mix(in srgb,var(--bio-tone) var(--sq-edge-k,100%),var(--sq-edge-mix,var(--bio-tone)))}
.reads-more{font:500 10px/1 'IBM Plex Sans',sans-serif;color:var(--sq-muted,var(--dfaint));white-space:nowrap;justify-self:end;transform:translateX(calc(-1 * var(--reads-cell)))}
.reads-more-right{justify-self:start;transform:translateX(var(--reads-cell))}
.reads-outside,.reads-empty{grid-column:1/-1;font:italic 400 11px/1 'IBM Plex Sans',sans-serif;color:var(--sq-muted,var(--dfaint));white-space:nowrap;padding-left:2px}
p.reads-empty{margin:4px 0;font-size:11.5px;font-style:normal;line-height:1.4}
.reads-legend{list-style:none;display:flex;flex-wrap:wrap;gap:3px 14px;margin:8px 0 0;padding:0;font-size:11.5px;line-height:15px;color:var(--sq-text,var(--dfaint))}
.reads-legend li{display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums lining-nums}
.reads-legend small{font-size:11px;color:var(--sq-muted,var(--dfaint))}
/* In a sized layout tile the alignment well takes the spare height, so the
   key and caption settle at the foot of the card instead of floating. */
.section-layout-tile .reads-scroll{display:flex;flex-direction:column}
.section-layout-tile .reads-grid{flex:none;margin-block:auto}
.reads-key{flex:none;display:inline-flex;align-items:center;justify-content:center;width:10px;height:10px;border-radius:3px;font-size:10px;line-height:1;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone,currentColor) var(--sq-edge-k,70%),var(--sq-edge-mix,var(--dink)))}
.reads-key[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) var(--sq-tint,30%),var(--sq-surface,transparent))}
.reads-key.bio-tone-insert{color:transparent;background:var(--bio-tone);box-shadow:none;border-radius:0;clip-path:polygon(50% 8%,100% 92%,0 92%)}
.reads-key-clip{background:color-mix(in srgb,var(--dtext) 18%,transparent);opacity:.7;box-shadow:inset 0 0 0 1px var(--sq-line-strong,transparent)}
body.sk-blueprint :is(.reads-key,.reads-band,.reads-cell){border-radius:0}
@media print{.reads-scroll{max-height:none;overflow:visible}.reads-cell,.reads-band,.reads-dcell i,.reads-wedge,.reads-lane,.reads-hl{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
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
