/* Sequence track: one short nucleotide or protein sequence as monospace
   letters with a coordinate ruler, highlighted ranges, a cursor, a zoom window
   and a reveal boundary. Every value is authored in the spec; nothing is
   computed from data files. Shared alphabet, range and tone rules live in
   ../bio.js. The mark/range helpers below (seqRangeWarnings, seqMarkWarnings,
   seqCleanMarks, seqLetters) are reused by the frames panel. */
var SEQ_MAX_MARKS = 24,
  SEQ_WRAP_MIN = 20,
  SEQ_WRAP_MAX = 120,
  SEQ_WRAP_DEFAULT = 60,
  SEQ_STATE_KEYS = ['marks', 'cursor', 'window', 'reveal', 'note', 'enterOnce'];

/* `start` must leave room for the longest sequence without leaving the safe
   integer range, so every printed coordinate is exact. */
function seqValidStart(value) {
  return bioPosition(value) && value <= Number.MAX_SAFE_INTEGER - BIO_MAX_SEQUENCE;
}
function seqStart(panel) {
  return seqValidStart(panel.start) ? panel.start : 1;
}
/* Clean letters capped at `max`, with zero-based positions of letters the
   alphabet rejects (those render as unknown). */
function seqText(panel, alphabet, max) {
  var normalized = bioNormalizeSequence(panel.sequence, alphabet);
  return {
    text: normalized.text.slice(0, max),
    invalid: normalized.invalid.filter(function (index) { return index < max; }),
  };
}
/* The coordinate span of the declared letters: {first, last, length}. */
function seqSpan(panel, alphabet, max) {
  var text = seqText(panel, alphabet, max).text, start = seqStart(panel);
  return { first: start, last: start + text.length - 1, length: text.length };
}
function seqWithin(value, span) {
  return !span.length || (value >= span.first && value <= span.last);
}
function seqSequenceWarnings(panel, path, warnings, alphabet, min, max) {
  var at = path + '.sequence';
  if (typeof panel.sequence !== 'string') {
    warnings.push(at + ': expected a string of ' + min + '–' + max + ' letters — panel renders empty');
    return;
  }
  var normalized = bioNormalizeSequence(panel.sequence, alphabet);
  if (normalized.text.length < min)
    warnings.push(at + ': expected ' + min + '–' + max + ' letters — ' + (normalized.text.length ? 'nothing to translate' : 'panel renders empty'));
  else if (normalized.text.length > max)
    warnings.push(at + ': only the first ' + max + ' of ' + normalized.text.length + ' letters render');
  var invalid = normalized.invalid.filter(function (index) { return index < max; });
  if (invalid.length)
    warnings.push(at + ': ' + invalid.length + (invalid.length === 1 ? ' letter is' : ' letters are') + ' not in the ' + alphabet +
      ' alphabet (letter ' + invalid.slice(0, 6).map(function (index) { return index + 1; }).join(', ') + (invalid.length > 6 ? ', …' : '') + ') — shown as unknown');
}
/* One {from,to} range in sequence coordinates. Returns the clean range or
   null after naming the exact field that failed. */
function seqRangeWarnings(value, at, warnings, span) {
  if (!panelObject(value)) {
    warnings.push(at + ': expected {from,to} as 1-based inclusive positions — ignored');
    return null;
  }
  var ok = true;
  if (!bioPosition(value.from)) { warnings.push(at + '.from: expected a 1-based safe integer position — ignored'); ok = false; }
  if (!bioPosition(value.to)) { warnings.push(at + '.to: expected a 1-based safe integer position — ignored'); ok = false; }
  if (!ok) return null;
  if (value.from > value.to) {
    warnings.push(at + ': from ' + value.from + ' must be ≤ to ' + value.to + ' — ignored');
    return null;
  }
  if (span.length && (value.to < span.first || value.from > span.last)) {
    warnings.push(at + ': range ' + value.from + '–' + value.to + ' lies outside ' + span.first + '–' + span.last + ' — ignored');
    return null;
  }
  return { from: value.from, to: value.to };
}
function seqMarkWarnings(marks, path, warnings, span) {
  if (marks == null) return;
  if (!Array.isArray(marks)) {
    warnings.push(path + ': expected an array of {id,from,to,tone?,label?} — ignored');
    return;
  }
  if (marks.length > SEQ_MAX_MARKS) warnings.push(path + ': only the first ' + SEQ_MAX_MARKS + ' marks render');
  var seen = Object.create(null);
  marks.slice(0, SEQ_MAX_MARKS).forEach(function (mark, i) {
    var at = path + '[' + i + ']';
    if (!panelObject(mark) || typeof mark.id !== 'string' || !mark.id) {
      warnings.push(at + '.id: needs a non-empty string — mark skipped');
      return;
    }
    if (seen[mark.id]) warnings.push(at + '.id: duplicate id "' + mark.id + '" — later mark skipped');
    seen[mark.id] = true;
    seqRangeWarnings(mark, at, warnings, span);
    if (mark.tone != null && BIO_TONES.indexOf(mark.tone) < 0)
      warnings.push(at + '.tone: expected one of ' + BIO_TONES.join(' ') + ' — using neutral');
    if (mark.label != null && typeof mark.label !== 'string')
      warnings.push(at + '.label: expected text — ignored');
  });
}
/* Valid marks clipped to the span, in authored order (later marks draw on
   top). Mirrors seqMarkWarnings without reporting. */
function seqCleanMarks(marks, span) {
  var seen = Object.create(null), out = [];
  if (!Array.isArray(marks) || !span.length) return out;
  marks.slice(0, SEQ_MAX_MARKS).forEach(function (mark) {
    if (!panelObject(mark) || typeof mark.id !== 'string' || !mark.id || seen[mark.id]) return;
    seen[mark.id] = true;
    var range = bioRange(mark, '', null, span.first, span.last);
    if (!range) return;
    out.push({
      id: mark.id,
      from: Math.max(range.from, span.first),
      to: Math.min(range.to, span.last),
      tone: bioTone(mark.tone),
      label: typeof mark.label === 'string' ? mark.label : '',
    });
  });
  return out;
}
/* Per-letter display records. `tone` is the topmost mark covering the letter
   (null when none); `tick` marks a ruler number every ten coordinates. */
function seqLetters(text, invalid, first, marks) {
  var unknown = Object.create(null);
  invalid.forEach(function (index) { unknown[index] = true; });
  var letters = [];
  for (var i = 0; i < text.length; i++) {
    var coord = first + i, tone = null, markId = null;
    for (var m = 0; m < marks.length; m++)
      if (coord >= marks[m].from && coord <= marks[m].to) { tone = marks[m].tone; markId = marks[m].id; }
    letters.push({
      ch: text.charAt(i), coord: coord, index: i,
      cls: unknown[i] ? 'bio-b bio-b-x' : bioLetterClass(text.charAt(i)),
      unknown: !!unknown[i], tone: tone, markId: markId, tick: coord % 10 === 0,
    });
  }
  return letters;
}
function seqLegend(marks) {
  return marks.filter(function (mark) { return mark.label; });
}

function sequenceStateWarnings(state, path, panel, warnings) {
  var span = seqSpan(panel, bioAlphabet(panel.alphabet), BIO_MAX_SEQUENCE);
  Object.keys(state).forEach(function (key) {
    if (SEQ_STATE_KEYS.indexOf(key) < 0) warnings.push(path + '.' + key + ': unknown field — ignored');
  });
  if (panelOwn(state, 'marks')) seqMarkWarnings(state.marks, path + '.marks', warnings, span);
  if (panelOwn(state, 'cursor') && state.cursor !== null && !(bioPosition(state.cursor) && seqWithin(state.cursor, span)))
    warnings.push(path + '.cursor: expected a 1-based position' + (span.length ? ' between ' + span.first + ' and ' + span.last : '') + ' or null — cursor hidden');
  if (panelOwn(state, 'window') && state.window !== null) seqRangeWarnings(state.window, path + '.window', warnings, span);
  if (panelOwn(state, 'reveal') && state.reveal !== null && !(bioCount(state.reveal) && state.reveal <= span.length))
    warnings.push(path + '.reveal: expected an integer 0–' + span.length + ' or null — all letters shown');
  if (panelOwn(state, 'note') && state.note !== null && typeof state.note !== 'string')
    warnings.push(path + '.note: expected text — ignored');
}
function sequencePatchWarnings(state, path, panel, warnings) {
  softwarePanelPatchWarnings(state, path, panel, warnings, sequenceStateWarnings);
}
function sequenceDeclarationWarnings(panel, path, warnings) {
  var alphabet = bioAlphabet(panel.alphabet);
  if (panel.alphabet !== undefined && BIO_ALPHABET_NAMES.indexOf(panel.alphabet) < 0)
    warnings.push(path + '.alphabet: expected dna, rna or protein — using dna');
  seqSequenceWarnings(panel, path, warnings, alphabet, 1, BIO_MAX_SEQUENCE);
  if (panel.start !== undefined && !seqValidStart(panel.start))
    warnings.push(path + '.start: expected a safe integer ≥ 1 — using 1');
  if (panel.strand !== undefined && panel.strand !== '+' && panel.strand !== '-')
    warnings.push(path + '.strand: expected "+" or "-" — using +');
  if (panel.label !== undefined && typeof panel.label !== 'string')
    warnings.push(path + '.label: expected text — ignored');
  if (panel.wrap !== undefined && !(Number.isSafeInteger(panel.wrap) && panel.wrap >= SEQ_WRAP_MIN && panel.wrap <= SEQ_WRAP_MAX))
    warnings.push(path + '.wrap: expected an integer ' + SEQ_WRAP_MIN + '–' + SEQ_WRAP_MAX + ' — using ' + SEQ_WRAP_DEFAULT);
  sequencePatchWarnings(panel.initial, path + '.initial', panel, warnings);
}

/* Pure display model for one folded snapshot. Coordinates are 1-based and
   inclusive; `rows` chunk the visible letters by `wrap`. */
function sequenceModel(panel, state) {
  state = panelObject(state) ? state : {};
  var alphabet = bioAlphabet(panel.alphabet),
    seq = seqText(panel, alphabet, BIO_MAX_SEQUENCE),
    text = seq.text,
    start = seqStart(panel),
    span = { first: start, last: start + text.length - 1, length: text.length },
    wrap = Number.isSafeInteger(panel.wrap) && panel.wrap >= SEQ_WRAP_MIN && panel.wrap <= SEQ_WRAP_MAX ? panel.wrap : SEQ_WRAP_DEFAULT,
    marks = seqCleanMarks(state.marks, span),
    cursor = bioPosition(state.cursor) && span.length && seqWithin(state.cursor, span) ? state.cursor : null,
    window = span.length ? bioRange(state.window, '', null, span.first, span.last) : null,
    reveal = bioCount(state.reveal) && state.reveal <= span.length ? state.reveal : null;
  if (window) window = { from: Math.max(window.from, span.first), to: Math.min(window.to, span.last) };
  var from = window ? window.from : span.first,
    to = window ? window.to : span.last,
    letters = seqLetters(text, seq.invalid, span.first, marks).filter(function (letter) {
      return letter.coord >= from && letter.coord <= to;
    });
  letters.forEach(function (letter) {
    letter.revealed = reveal === null || letter.index < reveal;
    letter.cursor = letter.coord === cursor;
  });
  var rows = [];
  for (var i = 0; i < letters.length; i += wrap) {
    var chunk = letters.slice(i, i + wrap), cursorAt = -1;
    chunk.forEach(function (letter, index) { if (letter.cursor) cursorAt = index; });
    rows.push({ from: chunk[0].coord, to: chunk[chunk.length - 1].coord, letters: chunk, cursorAt: cursorAt });
  }
  return {
    alphabet: alphabet,
    strand: panel.strand === '-' ? '-' : '+',
    label: typeof panel.label === 'string' ? panel.label : '',
    start: start, length: span.length, first: span.first, last: span.last, text: text,
    wrap: wrap, window: window, from: from, to: to,
    hiddenBefore: span.length ? from - span.first : 0,
    hiddenAfter: span.length ? span.last - to : 0,
    reveal: reveal, cursor: cursor, marks: marks, legend: seqLegend(marks),
    rows: rows, invalid: seq.invalid.length,
    note: typeof state.note === 'string' ? state.note : '',
  };
}
function seqSummary(model) {
  var parts = [(model.label || 'Sequence') + ': ' + model.alphabet.toUpperCase() + ', ' + model.strand + ' strand'];
  if (!model.length) parts.push('no letters');
  else {
    parts.push('positions ' + bioFormatCoord(model.from) + '–' + bioFormatCoord(model.to) +
      (model.window ? ' of ' + bioFormatCoord(model.first) + '–' + bioFormatCoord(model.last) : ''));
    parts.push(model.marks.length + (model.marks.length === 1 ? ' mark' : ' marks'));
    if (model.cursor !== null) parts.push('cursor at ' + bioFormatCoord(model.cursor));
    if (model.reveal !== null) parts.push(model.reveal + ' of ' + model.length + ' letters revealed');
  }
  return parts.join(', ');
}
/* Legend markup shared by the sequence-teaching panels (`.bio-legend`). */
function bioLegendHTML(legend) {
  if (!legend.length) return '';
  /* Four or more long entries settle into two aligned columns (authored order,
     row by row) instead of a ragged wrap; short legends stay one flowing row. */
  var chars = legend.reduce(function (sum, mark) { return sum + String(mark.label).length + 12; }, 0);
  return '<ul class="bio-legend' + (legend.length >= 4 && chars * 6.4 > 520 ? ' bio-legend-grid' : '') + '" aria-label="Highlighted ranges">' + legend.map(function (mark) {
    return '<li class="bio-key"><i class="bio-tone-' + mark.tone + '" aria-hidden="true"></i>' + esc(mark.label) +
      ' <small>' + bioFormatCoord(mark.from) + (mark.to !== mark.from ? '–' + bioFormatCoord(mark.to) : '') + '</small></li>';
  }).join('') + '</ul>';
}
/* `cursor` (optional) is the cursor coordinate on this row: tick labels close
   enough to collide with the cursor pill get `seq-tick-near` and step aside,
   since the pill already prints that coordinate's neighbourhood. */
function seqRulerHTML(letters, cls, cursor) {
  return letters.map(function (letter) {
    var near = letter.tick && cursor != null && Math.abs(letter.coord - cursor) <= (bioFormatCoord(letter.coord).length > 2 ? 2 : 1);
    return '<span class="' + cls + (letter.tick ? ' seq-tick-n' : letter.coord % 5 === 0 ? ' seq-tick-5' : '') + (near ? ' seq-tick-near' : '') + '">' +
      (letter.tick ? '<i>' + bioFormatCoord(letter.coord) + '</i>' : '') + '</span>';
  }).join('');
}
/* `dx` is the whole-cell offset from the previously rendered cursor in the
   same row; the shared glide lifecycle then transitions it to zero. `fresh`
   ({from,to}, zero-based letter indices) marks letters revealed by this step
   so they ink in once; it only ever comes from an animated render. */
function sequenceHTML(panel, state, dx, fresh) {
  var model = sequenceModel(panel, state);
  var h = '<div class="seq-track' + (model.alphabet === 'protein' ? ' bio-protein' : '') + '" role="group" aria-label="' + esc(seqSummary(model)) + '">';
  h += '<div class="seq-head' + (model.label ? '' : ' seq-head-bare') + '">' + (model.label ? '<span class="seq-label">' + esc(model.label) + '</span>' : '') +
    '<span class="seq-meta">' + model.alphabet.toUpperCase() + ' · ' + (model.strand === '-' ? '−' : '+') + ' strand' +
    (model.length ? ' · ' + bioFormatCoord(model.first) + '–' + bioFormatCoord(model.last) : '') + '</span></div>';
  if (!model.length) return h + '<div class="seq-empty">No sequence declared.</div></div>';
  if (model.hiddenBefore) h += '<div class="seq-more">… ' + bioFormatCoord(model.hiddenBefore) + ' more before ' + bioFormatCoord(model.from) + '</div>';
  /* Printed-figure rhythm: letters fall into groups of ten by coordinate
     (GenBank style) with a narrow gap track after each tenth, and the row's
     last coordinate closes the line. Grouping needs every row to share one
     gap pattern, so it applies to a single row or a wrap that is a multiple
     of ten. --seq-at stays the letter index; --seq-g adds the gap tracks. */
  var span0 = model.rows.length ? model.rows[0].letters : [], grouped = span0.length > 1 && (model.rows.length === 1 || model.wrap % 10 === 0);
  var cut = function (letters, index) { return grouped && letters[index].tick && index < span0.length - 1 && index < letters.length - 1; };
  var gapsBefore = function (letters, index) { var n = 0; for (var j = 0; j < index; j++) if (cut(letters, j)) n++; return n; };
  var tpl = '';
  if (grouped) {
    var run = 0, parts = [];
    span0.forEach(function (letter, index) { run++; if (cut(span0, index) || index === span0.length - 1) { parts.push('repeat(' + run + ',minmax(9px,1fr))'); run = 0; } });
    tpl = parts.join(' minmax(4px,.45fr) ') + ' var(--seq-endw)';
  }
  h += '<div class="seq-rows' + (grouped ? ' seq-grouped' : '') + '" style="--seq-span:' + (model.rows.length ? model.rows[0].letters.length : 1) + '">';
  model.rows.forEach(function (row) {
    var gap = function (index, extra) { return cut(row.letters, index) ? '<span class="seq-gap' + (extra || '') + '"></span>' : ''; };
    h += '<div class="seq-row" style="--seq-cols:' + (grouped ? span0.length : row.letters.length) + (grouped ? ';--seq-tpl:' + tpl : '') + '"><span class="seq-gutter">' + bioFormatCoord(row.from) + '</span><div class="seq-cells">' +
      '<div class="seq-line seq-ruler" aria-hidden="true">' + row.letters.map(function (letter, index) {
        return seqRulerHTML([letter], 'seq-tick', row.cursorAt >= 0 ? model.cursor : null) + gap(index);
      }).join('') + '</div>' +
      '<div class="seq-line seq-letters">' + row.letters.map(function (letter, index) {
        var k = fresh && letter.revealed && letter.index >= fresh.from && letter.index < fresh.to ? letter.index - fresh.from : -1;
        /* Unmade letters sit near the paper; only the few just past the
           reveal edge keep a little more ink, so the growing end reads. */
        var far = letter.revealed || model.reveal === null ? -1 : model.reveal > 0 ? Math.max(10, 38 - Math.min(letter.index - model.reveal, 6) * 5) : 14;
        return '<span class="' + letter.cls + (letter.revealed ? '' : ' seq-dim') + (letter.cursor ? ' seq-at-cursor' : '') + (k >= 0 ? ' seq-new' : '') + '"' +
          (k >= 0 ? ' style="--seq-k:' + Math.min(k, 6) + '"' : far >= 0 ? ' style="--seq-ink:' + far + '%"' : '') +
          (letter.unknown ? ' title="Not in the ' + model.alphabet + ' alphabet"' : '') + '>' + esc(letter.ch) + '</span>' + gap(index);
      }).join('') + (grouped ? '<span class="seq-endc" aria-hidden="true" style="grid-column:' + (row.letters.length + gapsBefore(row.letters, row.letters.length - 1) + 1) + '/-1">' + bioFormatCoord(row.to) + '</span>' : '') + '</div>' +
      '<div class="seq-line seq-band" aria-hidden="true">' + row.letters.map(function (letter, index) {
        var previous = row.letters[index - 1], next = row.letters[index + 1];
        return '<span class="seq-bandcell' + (letter.tone ? ' bio-tone-' + letter.tone : '') +
          (letter.tone && !(previous && previous.markId === letter.markId) ? ' seq-band-start' : '') +
          (letter.tone && !(next && next.markId === letter.markId) ? ' seq-band-end' : '') + '"></span>' +
          gap(index, letter.tone && next && next.markId === letter.markId ? ' bio-tone-' + letter.tone : '');
      }).join('') + '</div>';
    if (row.cursorAt >= 0)
      h += '<div class="seq-line seq-cursor-line"' + (grouped ? ' style="--seq-g:' + gapsBefore(row.letters, row.cursorAt) + '"' : '') + '><span class="seq-cur" style="--seq-at:' + row.cursorAt +
        (dx ? ';transform:translateX(' + dx * 100 + '%)' : '') + '"><b></b><i>' + bioFormatCoord(model.cursor) + '</i></span></div>';
    h += '</div></div>';
  });
  h += '</div>';
  if (model.hiddenAfter) h += '<div class="seq-more">… ' + bioFormatCoord(model.hiddenAfter) + ' more after ' + bioFormatCoord(model.to) + '</div>';
  h += bioLegendHTML(model.legend) + '</div>';
  return softwarePanelShell(h, { note: model.note });
}

PanelRegistry.define('sequence', {
  label: 'Sequence track',
  since: '0.2.0',
  order: 40,
  validateDeclaration: sequenceDeclarationWarnings,
  validatePatch: sequencePatchWarnings,
  fold: function (panel, steps) {
    return foldCommonPanelStates(panel, steps, {
      accept: {
        marks: function (value) { return value === null || Array.isArray(value); },
        cursor: function (value) { return value === null || bioPosition(value); },
        window: function (value) { return value === null || !!bioRange(value); },
        reveal: function (value) { return value === null || bioCount(value); },
        note: function (value) { return value === null || typeof value === 'string'; },
      },
    });
  },
  render: function (host, panel, state, skin, states, stepIdx, animate) {
    var model = sequenceModel(panel, state), previous = host._seqCursor || null, now = null, dx = 0, fresh = null;
    model.rows.forEach(function (row, index) { if (row.cursorAt >= 0) now = { row: index, at: row.cursorAt, from: row.from }; });
    host._seqCursor = now;
    if (animate && previous && now && previous.row === now.row && previous.from === now.from) dx = previous.at - now.at;
    /* Letters made since the last render ink in once (same sequence only). */
    var shown = model.reveal === null ? model.length : model.reveal, before = host._seqReveal;
    if (animate && typeof before === 'number' && host._seqText === model.text && shown > before) fresh = { from: before, to: shown };
    host._seqReveal = shown; host._seqText = model.text;
    var html = sequenceHTML(panel, state, dx, fresh);
    return { html: html, baseline: dx || fresh ? sequenceHTML(panel, state, 0, null) : null, glide: { selector: '.seq-cur', multiple: false } };
  },
  presentation: { ambientInitial: true },
  layout: {
    sectionSizing: { minWidth: 320, preferredWidth: 520, maxWidth: 1000, aspectPolicy: 'content', grow: 1 },
    height: 8, fallbackHeight: 8,
  },
  /* The first block is the shared residue and tone palette. The sequence
     panel owns these `.bio-*` rules; reads, frames and locus
     reuse the class names and must not redefine them. Letters lean toward
     the skin's text colour through color-mix so one rule reads on light and
     dark skins. `.bio-protein` switches letters to chemistry groups. Each
     `.bio-tone-<tone>` sets `--bio-tone` plus a translucent background and a
     border colour; use `var(--bio-tone)` for solid fills such as SVG. */
  styles: String.raw`
.bio-b{display:inline-block;min-width:0;font:600 13px/1.4 'IBM Plex Mono',monospace;text-align:center;border-radius:2px;color:color-mix(in srgb,var(--bio-letter,var(--dfaint)) 72%,var(--dtext))}
.bio-b-a{--bio-letter:#22c55e}.bio-b-c{--bio-letter:#3b82f6}.bio-b-g{--bio-letter:#f59e0b}.bio-b-t,.bio-b-u{--bio-letter:#ef4444}
.bio-b-n{--bio-letter:#94a3b8}.bio-b-x{--bio-letter:#94a3b8;text-decoration:underline dotted;opacity:.75}
.bio-b-stop{--bio-letter:#ef4444;font-weight:800}
.bio-protein .bio-b-a,.bio-protein .bio-b-v,.bio-protein .bio-b-l,.bio-protein .bio-b-i,.bio-protein .bio-b-m,.bio-protein .bio-b-f,.bio-protein .bio-b-w{--bio-letter:#f59e0b}
.bio-protein .bio-b-s,.bio-protein .bio-b-t,.bio-protein .bio-b-n,.bio-protein .bio-b-q,.bio-protein .bio-b-y{--bio-letter:#22c55e}
.bio-protein .bio-b-k,.bio-protein .bio-b-r,.bio-protein .bio-b-h{--bio-letter:#3b82f6}
.bio-protein .bio-b-d,.bio-protein .bio-b-e{--bio-letter:#ef4444}
.bio-protein .bio-b-g,.bio-protein .bio-b-p,.bio-protein .bio-b-c{--bio-letter:#a855f7}
.bio-protein .bio-b-x{--bio-letter:#94a3b8}
.bio-tone-neutral{--bio-tone:#94a3b8}.bio-tone-accent{--bio-tone:#38bdf8}.bio-tone-insert{--bio-tone:#a78bfa}.bio-tone-mismatch{--bio-tone:#f43f5e}
.bio-tone-motif{--bio-tone:#facc15}.bio-tone-primer{--bio-tone:#2dd4bf}.bio-tone-cut{--bio-tone:#e879f9}.bio-tone-feature{--bio-tone:#3b82f6}
.bio-tone-good{--bio-tone:#22c55e}.bio-tone-bad{--bio-tone:#ef4444}
[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) 30%,transparent);border-color:var(--bio-tone)}
/* Skin palettes for the sequence family. Every skin override skips letters
   and tones inside a mech scene (.mech-box): that stage keeps its own bright
   palette until the mech family re-lights it. The guard sits in :where() so
   it adds no specificity. Pastel, aurora and blueprint get
   their own residue letters, tones and a small --sq-* token set that the
   reads and locus panels read too (each with a fallback for other skins).
   Pastel carries sk-aurora as well, so its block must out-rank the aurora
   one: body.sk-pastel is (0,2,1) against .sk-aurora's (0,2,0). Screen only,
   so print keeps the neutral fallbacks. */
@media screen{
.sk-aurora :is(.seq-track,.reads-panel,.locus-panel,.bio-legend,.frm-key){
  --sq-ink:#EAF2FF;--sq-text:#B9C7DD;--sq-muted:#8DA2C6;--sq-line:#22324A;--sq-line-strong:#2E4466;
  --sq-well:#101A2C;--sq-well-line:#1D2A40;--sq-surface:#0B1220;--sq-ghost:#2E4466;
  --sq-accent:#38E1FF;--sq-accent-ink:#8AE8FF;--sq-accent-soft:rgba(56,225,255,.12);--sq-accent-line:rgba(56,225,255,.45);--sq-on-accent:#06202A;
  --sq-raise:0 4px 12px -6px rgba(0,0,0,.7);--sq-lift:0 1px 3px rgba(0,0,0,.55);--sq-edge-mix:#EAF2FF;--sq-edge-k:88%;--sq-tint:38%;--sq-soft:30%;--sq-r:999px}
.sk-aurora .bio-b-a:where(:not(.mech-box *)){--bio-letter:#4ADE80}.sk-aurora .bio-b-c:where(:not(.mech-box *)){--bio-letter:#60A5FA}.sk-aurora .bio-b-g:where(:not(.mech-box *)){--bio-letter:#FBBF24}.sk-aurora :is(.bio-b-t,.bio-b-u):where(:not(.mech-box *)){--bio-letter:#F87171}
.sk-aurora .bio-b-n:where(:not(.mech-box *)),.sk-aurora .bio-b-x:where(:not(.mech-box *)){--bio-letter:#8DA2C6}.sk-aurora .bio-b-stop:where(:not(.mech-box *)){--bio-letter:#F87171}
.sk-aurora .bio-protein :is(.bio-b-a,.bio-b-v,.bio-b-l,.bio-b-i,.bio-b-m,.bio-b-f,.bio-b-w):where(:not(.mech-box *)){--bio-letter:#FBBF24}
.sk-aurora .bio-protein :is(.bio-b-s,.bio-b-t,.bio-b-n,.bio-b-q,.bio-b-y):where(:not(.mech-box *)){--bio-letter:#4ADE80}
.sk-aurora .bio-protein :is(.bio-b-k,.bio-b-r,.bio-b-h):where(:not(.mech-box *)){--bio-letter:#60A5FA}
.sk-aurora .bio-protein :is(.bio-b-d,.bio-b-e):where(:not(.mech-box *)){--bio-letter:#F87171}
.sk-aurora .bio-protein :is(.bio-b-g,.bio-b-p,.bio-b-c):where(:not(.mech-box *)){--bio-letter:#B79CFF}
.sk-aurora .bio-protein .bio-b-x:where(:not(.mech-box *)){--bio-letter:#8DA2C6}
.sk-aurora .bio-b:where(:not(.mech-box *)){color:var(--bio-letter)}
/* Aurora primers move off teal to periwinkle so they never read as the green
   "good" pieces they prime. */
.sk-aurora .bio-tone-primer:where(:not(.mech-box *)){--bio-tone:#7C8CFF}
body.sk-pastel :is(.seq-track,.reads-panel,.locus-panel,.bio-legend,.frm-key){
  --sq-ink:#24324A;--sq-text:#526077;--sq-muted:#5F6C84;--sq-line:#E3E9F2;--sq-line-strong:#C9D2E1;
  --sq-well:#F6F8FC;--sq-well-line:#E6EBF3;--sq-surface:#FFFFFF;--sq-ghost:#C9D2E1;
  --sq-accent:#5263B9;--sq-accent-ink:#3D4C9E;--sq-accent-soft:#EEF0FB;--sq-accent-line:#C9CFF0;--sq-on-accent:#FFFFFF;
  --sq-raise:0 4px 12px -6px rgba(36,50,74,.25);--sq-lift:0 1px 2px rgba(36,50,74,.2);--sq-edge-mix:#24324A;--sq-edge-k:85%;--sq-tint:34%;--sq-soft:30%;--sq-r:999px}
body.sk-pastel .bio-b-a:where(:not(.mech-box *)){--bio-letter:#17784E}body.sk-pastel .bio-b-c:where(:not(.mech-box *)){--bio-letter:#2A64C2}body.sk-pastel .bio-b-g:where(:not(.mech-box *)){--bio-letter:#935A06}body.sk-pastel :is(.bio-b-t,.bio-b-u):where(:not(.mech-box *)){--bio-letter:#BE3446}
body.sk-pastel .bio-b-n:where(:not(.mech-box *)),body.sk-pastel .bio-b-x:where(:not(.mech-box *)){--bio-letter:#5F6C84}body.sk-pastel .bio-b-stop:where(:not(.mech-box *)){--bio-letter:#BE3446}
body.sk-pastel .bio-protein :is(.bio-b-a,.bio-b-v,.bio-b-l,.bio-b-i,.bio-b-m,.bio-b-f,.bio-b-w):where(:not(.mech-box *)){--bio-letter:#935A06}
body.sk-pastel .bio-protein :is(.bio-b-s,.bio-b-t,.bio-b-n,.bio-b-q,.bio-b-y):where(:not(.mech-box *)){--bio-letter:#17784E}
body.sk-pastel .bio-protein :is(.bio-b-k,.bio-b-r,.bio-b-h):where(:not(.mech-box *)){--bio-letter:#2A64C2}
body.sk-pastel .bio-protein :is(.bio-b-d,.bio-b-e):where(:not(.mech-box *)){--bio-letter:#BE3446}
body.sk-pastel .bio-protein :is(.bio-b-g,.bio-b-p,.bio-b-c):where(:not(.mech-box *)){--bio-letter:#7A55C9}
body.sk-pastel .bio-protein .bio-b-x:where(:not(.mech-box *)){--bio-letter:#5F6C84}
/* Pastel tones sit far apart on the wheel: accent indigo, primer sky, feature
   teal, good green, insert violet, cut magenta, motif amber, mismatch red. */
body.sk-pastel .bio-tone-neutral:where(:not(.mech-box *)){--bio-tone:#8A97AD}body.sk-pastel .bio-tone-accent:where(:not(.mech-box *)){--bio-tone:#5263B9}body.sk-pastel .bio-tone-insert:where(:not(.mech-box *)){--bio-tone:#7A55C9}
body.sk-pastel .bio-tone-mismatch:where(:not(.mech-box *)){--bio-tone:#C93C4E}body.sk-pastel .bio-tone-motif:where(:not(.mech-box *)){--bio-tone:#B07A12}body.sk-pastel .bio-tone-primer:where(:not(.mech-box *)){--bio-tone:#3C93D9}
body.sk-pastel .bio-tone-cut:where(:not(.mech-box *)){--bio-tone:#A642B8}body.sk-pastel .bio-tone-feature:where(:not(.mech-box *)){--bio-tone:#1F8A93}body.sk-pastel .bio-tone-good:where(:not(.mech-box *)){--bio-tone:#2E8A5C}body.sk-pastel .bio-tone-bad:where(:not(.mech-box *)){--bio-tone:#C93C4E}
body.sk-pastel .bio-b:where(:not(.mech-box *)){color:var(--bio-letter)}
body.sk-blueprint :is(.seq-track,.reads-panel,.locus-panel,.bio-legend,.frm-key){
  --sq-ink:#F7FCFF;--sq-text:#D5E9F7;--sq-muted:#94BCD5;--sq-line:rgba(79,169,195,.45);--sq-line-strong:#4FA9C3;
  --sq-well:#062E61;--sq-well-line:rgba(79,169,195,.55);--sq-surface:#052956;--sq-ghost:rgba(148,188,213,.42);
  --sq-accent:#7FE3FF;--sq-accent-ink:#7FE3FF;--sq-accent-soft:rgba(127,227,255,.14);--sq-accent-line:rgba(127,227,255,.6);--sq-on-accent:#052956;
  --sq-raise:0 0 0 0 transparent;--sq-lift:0 0 0 0 transparent;--sq-edge-mix:#F7FCFF;--sq-edge-k:100%;--sq-tint:26%;--sq-soft:24%;--sq-r:1px}
body.sk-blueprint .bio-tone-good:where(:not(.mech-box *)){--bio-tone:#47F590}body.sk-blueprint .bio-tone-bad:where(:not(.mech-box *)),body.sk-blueprint .bio-tone-mismatch:where(:not(.mech-box *)){--bio-tone:#FF8A93}body.sk-blueprint .bio-tone-motif:where(:not(.mech-box *)){--bio-tone:#FFD166}
body.sk-blueprint .bio-tone-accent:where(:not(.mech-box *)){--bio-tone:#7FE3FF}
}
/* Legend chips: opaque tints (tone mixed into the card surface, never alpha)
   so a pale swatch keeps its hue, with an edge leaning toward the ink. */
.bio-legend{list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0 0;padding:0;font-size:11.5px;line-height:15px;color:var(--sq-text,var(--dtext))}
.bio-legend-grid{display:grid;grid-template-columns:repeat(2,minmax(0,max-content));gap:4px 16px;font-size:11px}
.bio-legend-grid .bio-key small{font-size:10.5px;white-space:nowrap}
.bio-key{display:inline-flex;align-items:center;gap:6px}
.bio-legend-grid .bio-key{display:flex;min-width:0}
.bio-key i{flex:none;display:inline-block;width:10px;height:10px;border-radius:3px;border:0;background:color-mix(in srgb,var(--bio-tone,currentColor) var(--sq-tint,30%),var(--sq-surface,transparent));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bio-tone,currentColor) var(--sq-edge-k,70%),var(--sq-edge-mix,var(--dink)))}
body.sk-blueprint .bio-key i{border-radius:0}
.bio-key small{font-size:11px;color:var(--sq-muted,var(--dfaint));font-variant-numeric:tabular-nums lining-nums}
.seq-track{color:var(--sq-text,var(--dtext));min-width:0}
/* Head plate shared with reads and locus: ink title on the left, the
   coordinates as a quiet tabular chip on the right, a hairline beneath. */
.seq-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:2px 10px;margin-bottom:4px;padding-bottom:5px;border-bottom:1px solid var(--sq-line,color-mix(in srgb,var(--dtext) 14%,transparent));line-height:18px}
/* With no label the chip alone is the head: no rule, no extra height. */
.seq-head-bare{justify-content:flex-start;margin-bottom:2px;padding-bottom:0;border-bottom:0}
.seq-label{font-size:13px;font-weight:600;letter-spacing:-.005em;color:var(--sq-ink,var(--dink))}
.seq-meta{font:500 10.5px/16px 'IBM Plex Mono',monospace;color:var(--sq-muted,var(--dfaint));font-variant-numeric:tabular-nums lining-nums;white-space:nowrap}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .seq-meta{padding:0 8px;border-radius:999px;background:var(--sq-well);box-shadow:inset 0 0 0 1px var(--sq-well-line)}
body.sk-blueprint .seq-meta{border-radius:2px}
.seq-empty,.seq-more{font-size:11px;color:var(--sq-muted,var(--dfaint))}
.seq-more{padding:2px 0 2px 46px;font-style:italic}
.seq-rows{display:flex;flex-direction:column;gap:6px;overflow-x:auto;padding-bottom:1px}
.seq-row{display:flex;align-items:flex-start;gap:6px;min-width:0}
.seq-gutter{flex:none;width:40px;padding-top:16px;text-align:right;font:500 10.5px/19px 'IBM Plex Mono',monospace;color:var(--sq-muted,var(--dfaint));font-variant-numeric:tabular-nums lining-nums}
.seq-cells{position:relative;flex:1;min-width:0;max-width:calc(var(--seq-span,60) * 30px);display:flex;flex-direction:column}
.seq-line{display:grid;grid-template-columns:var(--seq-tpl,repeat(var(--seq-cols),minmax(9px,1fr)));position:relative;width:calc(100% * var(--seq-cols) / var(--seq-span,var(--seq-cols)))}
/* Ruler: a hairline baseline with ticks centred on each letter; every fifth
   tick is taller and every tenth carries its coordinate. */
.seq-ruler{height:16px;align-items:end}
.seq-ruler::after{content:'';position:absolute;left:0;right:0;bottom:0;height:1px;background:var(--sq-line-strong,color-mix(in srgb,var(--dtext) 22%,transparent));pointer-events:none}
.seq-tick{position:relative;height:7px}
.seq-tick::before{content:'';position:absolute;left:50%;bottom:0;width:1px;height:3px;background:var(--sq-line-strong,color-mix(in srgb,var(--dtext) 22%,transparent))}
.seq-tick-5::before{height:5px}
.seq-tick-n::before{height:7px;background:var(--sq-muted,color-mix(in srgb,var(--dtext) 50%,transparent))}
.seq-tick-n i{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);font:500 10px/1 'IBM Plex Mono',monospace;font-style:normal;color:var(--sq-muted,var(--dfaint));font-variant-numeric:tabular-nums lining-nums;white-space:nowrap}
/* Groups of ten: a narrow gap track breaks the ruler's baseline between
   tens, and the row's last coordinate sets in its own closing column. */
.seq-grouped{--seq-endw:48px}
.seq-grouped .seq-cells{max-width:calc(var(--seq-span,60) * 31px + 48px)}
.seq-grouped .seq-ruler::after{right:var(--seq-endw)}
.seq-gap{display:block;position:relative;min-width:0}
.seq-ruler .seq-gap{align-self:end;height:1px;z-index:1;background:var(--sq-surface,transparent)}
.seq-band .seq-gap{height:6px;box-sizing:border-box}
.seq-band .seq-gap[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) var(--sq-tint,30%),var(--sq-surface,transparent));border:1px solid color-mix(in srgb,var(--bio-tone) var(--sq-edge-k,100%),var(--sq-edge-mix,var(--bio-tone)));border-left-width:0;border-right-width:0}
.seq-endc{justify-self:start;align-self:center;padding-left:8px;font:500 10.5px/19px 'IBM Plex Mono',monospace;color:var(--sq-muted,var(--dfaint));font-variant-numeric:tabular-nums lining-nums;white-space:nowrap}
/* A tick label right under the cursor pill would collide with it. */
.seq-tick-near i{visibility:hidden}
.seq-letters{margin-top:0}
.seq-letters .bio-b{display:block;position:relative;overflow:hidden;font-size:14px;line-height:19px;border-radius:4px;transition:color .42s cubic-bezier(.2,.7,.2,1),opacity .42s cubic-bezier(.2,.7,.2,1),background-color .24s ease}
/* Letters that do not exist yet sit close to the paper (about 1.5:1), each
   on a short muted slot, so the unmade run reads as a dashed rule rather
   than faded type. The few just past the reveal edge keep a little more ink
   (--seq-ink, set per letter) so the growing end is visible. */
.seq-dim{opacity:.25}
.sk-aurora .seq-dim,body.sk-pastel .seq-dim,body.sk-blueprint .seq-dim{opacity:1;color:color-mix(in srgb,var(--bio-letter,var(--sq-muted)) var(--seq-ink,14%),var(--sq-surface,transparent))}
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .seq-dim::after{content:'';position:absolute;left:24%;right:24%;bottom:1px;height:1px;border-radius:1px;background:color-mix(in srgb,var(--sq-muted) 55%,var(--sq-surface))}
.seq-at-cursor{background:var(--sq-accent-soft,color-mix(in srgb,var(--dink) 14%,transparent));box-shadow:inset 0 0 0 1px var(--sq-accent-line,transparent)}
/* The cursor letter is the leading edge: the pill's caret drops onto an
   accent baseline under it. */
:is(.sk-aurora,.sk-pastel,.sk-blueprint) .seq-at-cursor{box-shadow:inset 0 0 0 1px var(--sq-accent-line),inset 0 -2px 0 var(--sq-accent)}
/* Letters made this step ink in once, from ghost to full colour with a small
   rise and an accent-soft flash, 40 ms apart (capped at 240 ms). */
@keyframes seq-ink{from{color:color-mix(in srgb,var(--bio-letter,currentColor) 18%,var(--sq-surface,transparent));background-color:var(--sq-accent-soft,transparent);transform:translateY(3px)}}
@media (prefers-reduced-motion: no-preference){.seq-letters .seq-new{animation:seq-ink .42s cubic-bezier(.16,1,.3,1) calc(var(--seq-k,0) * 40ms) backwards}}
/* Range bands: opaque tinted pills under the letters with a tone edge; a new
   mark that starts right after another keeps a hairline gap. */
.seq-band{height:6px;margin-top:2px}
.seq-bandcell{display:block;box-sizing:border-box;height:6px}
.seq-bandcell[class*="bio-tone-"]{background:color-mix(in srgb,var(--bio-tone) var(--sq-tint,30%),var(--sq-surface,transparent));border:1px solid color-mix(in srgb,var(--bio-tone) var(--sq-edge-k,100%),var(--sq-edge-mix,var(--bio-tone)));border-left-width:0;border-right-width:0}
.seq-band-start{margin-left:1.5px;border-left-width:1px!important;border-radius:var(--sq-r,3px) 0 0 var(--sq-r,3px)}
.seq-band-end{margin-right:1.5px;border-right-width:1px!important;border-radius:0 var(--sq-r,3px) var(--sq-r,3px) 0}
.seq-band-start.seq-band-end{border-radius:var(--sq-r,3px)}
/* The cursor rides the ruler: a solid "now" pill with a caret that points
   at the current letter, so it costs no extra row. */
.seq-cursor-line{position:absolute;left:0;right:0;top:0;height:16px;pointer-events:none;z-index:1}
.seq-cur{grid-column:calc(var(--seq-at) + var(--seq-g,0) + 1);position:relative;display:block;height:100%;transition:transform .42s cubic-bezier(.2,.7,.2,1)}
.seq-cur b{position:absolute;left:50%;bottom:-2px;width:0;height:0;transform:translateX(-50%);border:4px solid transparent;border-top:4px solid var(--sq-accent,var(--dink));border-bottom:0}
.seq-cur i{position:absolute;left:50%;bottom:2px;transform:translateX(-50%);min-width:14px;box-sizing:border-box;text-align:center;font:600 10px/14px 'IBM Plex Mono',monospace;font-style:normal;font-variant-numeric:tabular-nums lining-nums;color:var(--sq-on-accent,var(--dink));background:var(--sq-accent,color-mix(in srgb,var(--dink) 12%,transparent));border-radius:999px;padding:0 5px;white-space:nowrap;box-shadow:0 0 0 2px var(--sq-surface,transparent),var(--sq-raise,0 0 0 0 transparent)}
body.sk-blueprint .seq-cur i{border-radius:2px}
@media (prefers-reduced-motion: reduce){.seq-cur,.seq-letters .bio-b{transition:none}.seq-letters .seq-new{animation:none}}
@media print{.bio-b,[class*="bio-tone-"],.seq-cur i,.bio-key i{-webkit-print-color-adjust:exact;print-color-adjust:exact}.seq-rows{overflow:visible}.seq-letters .seq-new{animation:none}}
`,
  authoring: {
    initialFields: true,
    transientFields: ['marks', 'cursor', 'window', 'reveal'],
    template: {
      title: 'Sequence track', label: 'Reference', alphabet: 'dna', strand: '+', start: 1, wrap: 60,
      sequence: 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG',
      initial: { marks: [{ id: 'start', from: 1, to: 3, tone: 'good', label: 'Start codon' }] },
    },
    setupFields: [
      ['label', 'text'], ['sequence', 'text'], ['alphabet', 'text'],
      ['start', 'num'], ['strand', 'text'], ['wrap', 'num'], ['initial', 'json'],
    ],
    patchFields: [['marks', 'json'], ['cursor', 'num'], ['window', 'json'], ['reveal', 'num'], ['note', 'text']],
    fieldMeta: {
      label: { label: 'Track label', help: 'Short name shown before the ruler, e.g. Reference.' },
      sequence: { label: 'Sequence', help: '1–240 letters (whitespace ignored). Letters outside the alphabet render as unknown.' },
      alphabet: { label: 'Alphabet', help: 'dna (ACGTN, default), rna (ACGUN) or protein (one-letter amino acids).' },
      start: { label: 'First coordinate', help: '1-based coordinate of the first letter; default 1. Marks, cursor and window use these coordinates.' },
      strand: { label: 'Strand', help: 'Shown as a label only; the sequence is never recomputed.' },
      wrap: { label: 'Letters per row', help: '20–120, default 60.' },
      marks: { label: 'Highlighted ranges', help: 'Full snapshot of up to 24 {id,from,to,tone?,label?} ranges. Later marks draw on top; labelled marks appear in the legend.', nullLabel: 'No marks' },
      cursor: { label: 'Cursor position', help: 'One coordinate drawn as a bracket under the letter.', nullLabel: 'Hide cursor' },
      window: { label: 'Zoom window', help: '{from,to}: only these coordinates render, with a “… n more” cue at each end.', nullLabel: 'Show all' },
      reveal: { label: 'Revealed letters', help: 'Letters beyond this count render dimmed, for “read this far” stories.', nullLabel: 'Reveal all' },
      note: { label: 'Explanation' },
    },
    picker: {
      order: 40, name: 'Sequence track', category: 'Science & sequencing',
      tagline: 'Letters, coordinates and highlighted ranges',
      description: 'Show a short DNA, RNA or protein sequence with a coordinate ruler, coloured range marks, a moving cursor, a zoom window and a reveal boundary that advance step by step.',
    },
    example: function (sample) {
      var panel = sample.panel, state = sample.state;
      panel.label = 'Reference';
      panel.sequence = 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAGCCTTAGGCA';
      state.marks = [
        { id: 'start', from: 1, to: 3, tone: 'good', label: 'Start codon' },
        { id: 'primer', from: 20, to: 35, tone: 'primer', label: 'Forward primer' },
      ];
      state.cursor = 17;
      panel.initial = builderClone(state);
      return sample;
    },
  },
});
